// src/bot/index.js

const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config.json');
const { handleInteraction } = require('./src/bot/interactions');
const { handleMessageCreate } = require('./src/bot/suggestions');
const { registerCommands } = require('./src/commands/commandsRegistration');

// setup the bot with intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// register slash commands
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await registerCommands(client.user.id, config.guildId);
});

// new messages and interactions handlers
client.on('messageCreate', (message) => handleMessageCreate(message, config));
client.on('interactionCreate', async (interaction) => {
    await handleInteraction(interaction, client);
});

client.login(config.botToken);
