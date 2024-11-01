const db = require('../database/database');
const { uploadToImgur } = require('../external/external');
const { createSuggestionEmbed } = require('../embeds/embeds');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { generateHexID } = require('../utils/idgenerator'); // Import the generateHexID function

async function handleMessageCreate(message, config) {
    if (message.channel.id === config.suggestionChannelId && !message.author.bot) {
        let imageUrl = null;

        const attachment = message.attachments.find(att => att.contentType && att.contentType.startsWith('image/'));
        if (attachment) {
            imageUrl = await uploadToImgur(attachment.url);
        }

        const hexID = generateHexID();

        db.run(`INSERT INTO suggestions (userId, content, imageUrl, hexID) VALUES (?, ?, ?, ?)`, [message.author.id, message.content, imageUrl, hexID], function (err) {
            if (err) {
                console.error('Insert error:', err.message);
            } else {
                const suggestionId = this.lastID;

                const embed = createSuggestionEmbed(message.author, message.content, hexID, 0, 0, 'pending', imageUrl, hexID);

                const buttons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId(`upvote_${suggestionId}`).setLabel('👍 Like').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`downvote_${suggestionId}`).setLabel('👎 Dislike').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId(`view_${suggestionId}`).setLabel('📊 View Votes').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`manage_${suggestionId}`).setLabel('🛠 Manage').setStyle(ButtonStyle.Primary)
                    );

                message.channel.send({ embeds: [embed], components: [buttons] }).then(async (msg) => {
                    db.run(`UPDATE suggestions SET messageId = ? WHERE id = ?`, [msg.id, suggestionId]);

                    const thread = await msg.startThread({
                        name: `Suggestion ${hexID} Thread`,
                        autoArchiveDuration: 10080, // 24 hours
                        reason: `Auto-thread for suggestion ${hexID}`,
                    });

                    await thread.send(`Discuss about <@${message.author.id}>'s suggestion here!`);
                });

                message.delete();
            }
        });
    }
}

module.exports = { handleMessageCreate };
