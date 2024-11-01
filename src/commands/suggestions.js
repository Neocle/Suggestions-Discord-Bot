// src/commands/suggestions.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../database/database');
const config = require('../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggestions')
        .setDescription('Manage suggestions')
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a suggestion by its hexID (Admin only)')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('The hexID of the suggestion to delete')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('database-clear')
                .setDescription('Clear the entire suggestions database (Admin only)')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (!interaction.member.roles.cache.has(config.adminRoleId)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        if (subcommand === 'delete') {
            await handleDeleteCommand(interaction);
        } else if (subcommand === 'database-clear') {
            await handleDatabaseClearCommand(interaction);
        }
    }
};

async function handleDeleteCommand(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const hexID = interaction.options.getString('id');

    db.run('DELETE FROM suggestions WHERE hexID = ?', [hexID], function (err) {
        if (err) {
            console.error('Error deleting suggestion:', err.message);
            return interaction.editReply({ content: 'Failed to delete the suggestion.' });
        }

        if (this.changes > 0) {
            interaction.editReply({ content: `Suggestion with ID ${hexID} has been deleted.` });
        } else {
            interaction.editReply({ content: `No suggestion found with the ID ${hexID}.` });
        }
    });
}

async function handleDatabaseClearCommand(interaction) {
    await interaction.deferReply({ ephemeral: true });

    await interaction.followUp({ content: 'Are you sure you want to clear all suggestions? Type "yes" to confirm.' });

    const filter = m => m.author.id === interaction.user.id && m.content.toLowerCase() === 'yes';
    const collector = interaction.channel.createMessageCollector({ filter, time: 15000 });

    collector.on('collect', async () => {
        db.run('DELETE FROM suggestions', function (err) {
            if (err) {
                console.error('Error clearing database:', err.message);
                return interaction.followUp({ content: 'Failed to clear the database.' });
            }
            interaction.followUp({ content: 'The suggestions database has been cleared.' });
        });
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.followUp({ content: 'Database clear command timed out. No action taken.' });
        }
    });
}
