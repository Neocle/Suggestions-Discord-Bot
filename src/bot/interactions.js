// src/bot/interactions.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ModalBuilder, TextInputBuilder, ButtonStyle, TextInputStyle } = require('discord.js');
const db = require('../database/database');
const config = require('../../config.json');
const { uploadToPasteGG } = require('../external/external');
const { updateSuggestionEmbed } = require('../embeds/embeds');
const suggestionCache = new Map();
const fs = require('fs');
const path = require('path');

const commands = new Map();
const commandFiles = fs.readdirSync(path.join(__dirname, '../commands')).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`../commands/${file}`);
    if (command.data && command.execute) {
        commands.set(command.data.name, command);
    } else {
        console.error(`Command ${file} is missing "data" or "execute" property.`);
    }
}

async function handleInteraction(interaction, client) {
    try {
        if (interaction.isCommand()) {
            const command = commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName}`);
                return interaction.reply({ content: 'Command not found.', ephemeral: true });
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error executing ${interaction.commandName}:`, error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error while executing this command.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'There was an error while executing this command.', ephemeral: true });
                }
            }
        }

        else if (interaction.isButton()) {
            const [action, suggestionId] = interaction.customId.split('_');
            const suggestionIDInt = parseInt(suggestionId);
        
            if (!['accept', 'reject', 'implement'].includes(action)) {
                await interaction.deferReply({ ephemeral: true });
            }
        
            db.get(`SELECT id FROM suggestions WHERE id = ?`, [suggestionIDInt], async (err, row) => {
                if (err) {
                    console.error('Error checking suggestion existence:', err.message);
                    return interaction.editReply({ content: 'Failed to process your request.', ephemeral: true });
                }
        
                if (!row) {
                    return interaction.editReply({ content: 'Suggestion not found.', ephemeral: true });
                }
        
                switch (action) {
                    case 'upvote':
                    case 'downvote':
                        await handleVote(interaction, suggestionIDInt, action, client);
                        break;
                    case 'view':
                        await handleViewVotes(interaction, suggestionIDInt);
                        break;
                    case 'manage':
                        await handleManage(interaction, suggestionIDInt, client);
                        break;
                    case 'accept':
                    case 'reject':
                    case 'implement':
                        await handleManageDecision(interaction, suggestionIDInt, action, client);
                        break;
                    default:
                        console.log(`Unknown action: ${action}`);
                        await interaction.editReply({ content: 'Unknown action.', ephemeral: true });
                        break;
                }
            });
        }

        else if (interaction.isModalSubmit()) {
            await interaction.deferReply({ ephemeral: true });
            await handleModalSubmit(interaction, client);
        }

    } catch (error) {
        console.error('Error handling interaction:', error.message);
        if (!interaction.replied) {
            await interaction.reply({ content: 'An error occurred while handling this interaction.', ephemeral: true });
        }
    }
}

async function handleVote(interaction, suggestionIDInt, action, client) {
    db.get(`SELECT * FROM suggestions WHERE id = ?`, [suggestionIDInt], (err, suggestion) => {
        if (err) {
            console.error('Error retrieving suggestion:', err.message);
            return interaction.editReply({ content: 'Something went wrong.', ephemeral: true });
        }

        if (!suggestion) {
            return interaction.editReply({ content: 'This suggestion no longer exists.', ephemeral: true });
        }

        const voteType = action === 'upvote' ? 'upvote' : 'downvote';
        db.get(`SELECT voteType FROM votes WHERE suggestionId = ? AND userId = ?`, [suggestionIDInt, interaction.user.id], (err, row) => {
            if (err) {
                console.error('Vote retrieval error:', err.message);
                return interaction.editReply({ content: 'Something went wrong with voting.', ephemeral: true });
            }

            if (row && row.voteType === voteType) {
                removeVote(interaction, suggestionIDInt, voteType, client);
            } else if (row) {
                switchVote(interaction, suggestionIDInt, voteType, row.voteType, client);
            } else {
                addVote(interaction, suggestionIDInt, voteType, client);
            }
        });
    });
}

function removeVote(interaction, suggestionIDInt, voteType, client) {
    db.run(`DELETE FROM votes WHERE suggestionId = ? AND userId = ?`, [suggestionIDInt, interaction.user.id], function (err) {
        if (err) {
            console.error('Vote deletion error:', err.message);
            return interaction.editReply({ content: 'Failed to update your vote.', ephemeral: true });
        }
        updateSuggestionVotes(interaction, suggestionIDInt, voteType, -1, 'Vote removed successfully.', client);
    });
}

function switchVote(interaction, suggestionIDInt, newVoteType, oldVoteType, client) {
    db.run(`UPDATE votes SET voteType = ? WHERE suggestionId = ? AND userId = ?`, [newVoteType, suggestionIDInt, interaction.user.id], function (err) {
        if (err) {
            console.error('Vote update error:', err.message);
            return interaction.editReply({ content: 'Failed to change your vote.', ephemeral: true });
        }
        updateSuggestionVotes(interaction, suggestionIDInt, newVoteType, 1, 'Vote updated successfully.', client, oldVoteType, -1);
    });
}

function addVote(interaction, suggestionIDInt, voteType, client) {
    db.run(`INSERT INTO votes (suggestionId, userId, voteType) VALUES (?, ?, ?)`, [suggestionIDInt, interaction.user.id, voteType], function (err) {
        if (err) {
            console.error('New vote insertion error:', err.message);
            return interaction.editReply({ content: 'Failed to submit your vote.', ephemeral: true });
        }
        updateSuggestionVotes(interaction, suggestionIDInt, voteType, 1, 'Vote submitted successfully.', client);
    });
}

function updateSuggestionVotes(interaction, suggestionIDInt, voteType, increment, successMessage, client, oppositeVoteType = null, oppositeIncrement = 0) {
    const voteField = voteType === 'upvote' ? 'upvotes' : 'downvotes';
    const oppositeField = oppositeVoteType === 'upvote' ? 'upvotes' : 'downvotes';

    db.run(`UPDATE suggestions SET ${voteField} = ${voteField} + ${increment} ${oppositeVoteType ? `, ${oppositeField} = ${oppositeField} + ${oppositeIncrement}` : ''} WHERE id = ?`, [suggestionIDInt], function (err) {
        if (err) {
            console.error('Vote update error:', err.message);
            return interaction.editReply({ content: 'Failed to update suggestion votes.', ephemeral: true });
        }

        db.get(`SELECT hexID FROM suggestions WHERE id = ?`, [suggestionIDInt], (err, row) => {
            if (err) {
                console.error('Error retrieving hexID:', err.message);
                return interaction.editReply({ content: 'Failed to update suggestion votes.', ephemeral: true });
            }

            updateSuggestionEmbed(interaction, suggestionIDInt, row.hexID, client);
            interaction.editReply({ content: successMessage, ephemeral: true });
        });
    });
}

async function handleViewVotes(interaction, suggestionIDInt) {
    if (!interaction.member.roles.cache.has(config.adminRoleId)) {
        return interaction.editReply({ content: "You don't have permission to do that.", ephemeral: true });
    }

    db.all(`SELECT userId, voteType FROM votes WHERE suggestionId = ?`, [suggestionIDInt], async (err, rows) => {
        if (err) {
            console.error('Error retrieving votes:', err.message);
            return interaction.editReply({ content: 'Failed to retrieve votes.', ephemeral: true });
        }

        const upvotes = [];
        const downvotes = [];

        for (const row of rows) {
            const member = await interaction.guild.members.fetch(row.userId).catch(() => null);
            const username = member ? member.user.tag : `Unknown User (ID: ${row.userId})`;

            row.voteType === 'upvote' ? upvotes.push(username) : downvotes.push(username);
        }

        const voteList = `👍 **Upvotes** (${upvotes.length}):\n${upvotes.join('\n') || 'No upvotes'}\n\n` +
                         `👎 **Downvotes** (${downvotes.length}):\n${downvotes.join('\n') || 'No downvotes'}`;

        const pasteggUrl = await uploadToPasteGG(voteList);

        if (pasteggUrl) {
            const embed = new EmbedBuilder()
                .setTitle('Vote List')
                .setDescription(`Here is the vote list for the suggestion: [Click here to view](${pasteggUrl})`)
                .setColor(config.embed.color)
                .setFooter({ text: 'This paste will expire in 30 days.', iconURL: config.embed.footer_icon });

            await interaction.editReply({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.editReply({ content: 'Failed to upload votes to Paste.gg.', ephemeral: true });
        }
    });
}

async function handleManage(interaction, suggestionIDInt, client) {
    if (!interaction.member.roles.cache.has(config.adminRoleId)) {
        return interaction.editReply({ content: "You don't have permission to do that.", ephemeral: true });
    }

    suggestionCache.set(interaction.user.id, suggestionIDInt);

    const manageButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId(`accept_${suggestionIDInt}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_${suggestionIDInt}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`implement_${suggestionIDInt}`).setLabel('🚀 Implement').setStyle(ButtonStyle.Primary)
        );

    await interaction.editReply({ content: 'Do you want to accept or reject this suggestion?', components: [manageButtons], ephemeral: true });
}

async function handleManageDecision(interaction, suggestionIDInt, action, client) {
    const modal = new ModalBuilder()
        .setCustomId(`${action}_modal_${suggestionIDInt}`)
        .setTitle(action === 'accept' ? 'Reason for Approval' : action === 'reject' ? 'Reason for Rejection' : 'Reason for Implementation');

    const reasonInput = new TextInputBuilder()
        .setCustomId('reasonInput')
        .setLabel(action === 'accept' ? 'Approval Reason' : action === 'reject' ? 'Rejection Reason' : 'Implementation Reason')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(`Provide the reason for ${action}.`)
        .setRequired(true);

    const actionRow = new ActionRowBuilder().addComponents(reasonInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
}

async function handleModalSubmit(interaction, client) {
    const suggestionId = suggestionCache.get(interaction.user.id);
    if (!suggestionId) {
        return interaction.followUp({ content: 'Suggestion ID not found in cache.', ephemeral: true });
    }

    const reason = interaction.fields.getTextInputValue('reasonInput');
    const actionType = interaction.customId.split('_')[0];

    let status;
    if (actionType === 'accept') {
        status = 'accepted';
    } else if (actionType === 'reject') {
        status = 'rejected';
    } else if (actionType === 'implement') {
        status = 'implemented';
    }

    db.run(`UPDATE suggestions SET status = ?, staffComment = ? WHERE id = ?`, [status, reason, suggestionId], function (err) {
        if (err) {
            console.error('Error updating suggestion status:', err.message);
            return interaction.followUp({ content: 'Failed to update the suggestion.', ephemeral: true });
        }

        db.get(`SELECT hexID FROM suggestions WHERE id = ?`, [suggestionId], (err, row) => {
            if (err) {
                console.error('Error retrieving hexID:', err.message);
                return interaction.followUp({ content: 'Failed to update the suggestion.', ephemeral: true });
            }

            updateSuggestionEmbed(interaction, suggestionId, row.hexID, client);
            interaction.followUp({ content: 'Suggestion updated successfully!', ephemeral: true });
        });
    });
}

module.exports = { handleInteraction };
