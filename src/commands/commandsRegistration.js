// src/commands/commandsRegistration.js
const { REST, Routes } = require('discord.js');
const config = require('../../config.json');
const fs = require('fs');
const path = require('path');

const commands = [];

const commandsPath = path.join(__dirname);
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./${file}`);
    if (command.data && command.execute) {
        commands.push(command.data.toJSON());
    } else {
        console.error(`Command file "${file}" is missing a "data" or "execute" property.`);
    }
}

const rest = new REST({ version: '10' }).setToken(config.botToken);

async function registerCommands(clientId, guildId) {
    try {
        console.log('Started slash command registration.');

        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );

        console.log('Successfully registered slash commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

module.exports = { registerCommands };
