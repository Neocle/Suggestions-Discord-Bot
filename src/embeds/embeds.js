const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { generateHexID } = require('../utils/idgenerator');
const config = require('../../config.json');
const db = require('../database/database');

function createSuggestionEmbed(author, content, hexID, upvotes = 0, downvotes = 0, status = 'pending', imageUrl = null) {
    const embed = new EmbedBuilder();

    if (config.embed.color) {
        embed.setColor(config.embed.color);
    } else {
        embed.setColor(0xFFFFFF);
    }

    if (config.embed.title) {
        embed.setTitle(`${config.embed.title} ${hexID}`);
    }

    if (content) {
        embed.addFields(
            { name: '• Suggestion', value: `>>> ${content}` || '>>> No content provided.' },
            { name: '• Statistics', value: `>>> **${upvotes}** Likes\n**${downvotes}** Dislikes\nStatus: **${capitalizeFirstLetter(status)}**`, inline: true },
            { name: '• Author', value: `>>> <@${author.id}>`, inline: true }
        );
    }

    if (author.displayAvatarURL) {
        embed.setThumbnail(author.displayAvatarURL({ format: 'png', dynamic: true }));
    }

    if (imageUrl) {
        embed.setImage(imageUrl);
    }

    if (config.embed.timestamp) {
        embed.setTimestamp();
    }

    if (config.embed.footer) {
        embed.setFooter({ text: config.embed.footer, iconURL: config.embed.footer_icon });
    }

    return embed;
}

async function updateSuggestionEmbed(interaction, suggestionIDInt, suggestionHexID, client) {
    db.get(`SELECT content, upvotes, downvotes, status, imageUrl, userId, staffComment, messageId, hexID FROM suggestions WHERE id = ?`, [suggestionIDInt], async (err, suggestion) => {
        if (err) {
            console.error('Suggestion retrieval error:', err.message);
            return;
        }

        if (!suggestion) {
            await interaction.reply({ content: 'Suggestion not found!', ephemeral: true });
            return;
        }

        let embedTitle = suggestion.status === 'implemented' ? `🚀 Implemented AloraMC Suggestion ${suggestionHexID}` : 
                         suggestion.status === 'accepted' ? `✅ Accepted AloraMC Suggestion ${suggestionHexID}` : 
                         suggestion.status === 'rejected' ? ` ❌ Rejected AloraMC Suggestion ${suggestionHexID}` : `${config.embed.title} ${suggestionHexID}`;

        let embedColor = suggestion.status === 'implemented' ? config.embed.implement_color :
                         suggestion.status === 'accepted' ? config.embed.accept_color : 
                         suggestion.status === 'rejected' ? config.embed.reject_color  : config.embed.color;

        const author = interaction.guild.members.cache.get(suggestion.userId);
        const avatarUrl = author ? author.user.displayAvatarURL({ format: 'png', dynamic: true }) : null;

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(embedTitle)
            .setFooter({ text: config.embed.footer , iconURL: config.embed.footer_icon })
            .addFields(
                { name: '• Suggestion', value: `>>> ${suggestion.content}` },
                { name: '• Statistics', value: `>>> **${suggestion.upvotes}** Likes\n**${suggestion.downvotes}** Dislikes\nStatus: **${capitalizeFirstLetter(suggestion.status)}**`, inline: true },
                { name: '• Author', value: `>>> <@${suggestion.userId}>`, inline: true }
            );

        if (suggestion.status !== 'pending') {
            embed.addFields({
                name: suggestion.status === 'accepted' ? '• Reason for Approval' : suggestion.status === 'rejected' ? '• Reason for Rejection' : '• Reason for Implementation',
                value: `>>> ${suggestion.staffComment || 'No reason provided'}`,
                inline: false
            });
        }

        if (suggestion.imageUrl) {
            embed.setImage(suggestion.imageUrl);
        }
        if (avatarUrl) {
            embed.setThumbnail(avatarUrl);
        }
        if (config.embed.timestamp) {
            embed.setTimestamp();
        }

        const channel = client.channels.cache.get(config.suggestionChannelId);
        if (!channel) {
            console.error('Channel not found.');
            return interaction.reply({ content: 'Channel not found!', ephemeral: true });
        }

        try {
            const suggestionMessage = await channel.messages.fetch(suggestion.messageId);
            
            if (!suggestionMessage) {
                console.error(`Message with ID ${suggestion.messageId} not found.`);
                return interaction.reply({ content: 'Suggestion message not found!', ephemeral: true });
            }

            let components;
            if (suggestion.status === 'pending') {
                components = [
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder().setCustomId(`upvote_${suggestionIDInt}`).setLabel('👍 Like').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId(`downvote_${suggestionIDInt}`).setLabel('👎 Dislike').setStyle(ButtonStyle.Danger),
                            new ButtonBuilder().setCustomId(`view_${suggestionIDInt}`).setLabel('📊 View Votes').setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId(`manage_${suggestionIDInt}`).setLabel('🛠 Manage').setStyle(ButtonStyle.Primary)
                        )
                ];
            } else {
                components = [
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder().setCustomId(`view_${suggestionIDInt}`).setLabel('📊 View Votes').setStyle(ButtonStyle.Secondary),
                            new ButtonBuilder().setCustomId(`manage_${suggestionIDInt}`).setLabel('🛠 Manage').setStyle(ButtonStyle.Primary)
                        )
                ];
            }

            await suggestionMessage.edit({ embeds: [embed], components });

        } catch (error) {
            console.error('Error:', error);
        }
    });
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = { createSuggestionEmbed, updateSuggestionEmbed };
