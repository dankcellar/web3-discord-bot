import { config } from 'dotenv';

import Commands from './commands.js';

config();

// https://discord.com/developers/applications/330539844889477121
const applicationId = '330539844889477121';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error('The DISCORD_TOKEN environment variable is required.');
}

try {
  // const guildId = 'ENTER';
  // const url_guild = `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`;
  // const commands_guild = [];
  // makeRequest(url_guild, commands_guild);

  const url = `https://discord.com/api/v10/applications/${applicationId}/commands`;
  const commands = [];
  Object.values(Commands).forEach((command) => {
    commands.push(command.toJSON());
  });
  makeRequest(url, commands);
} catch (err) {
  console.error(err);
}

async function makeRequest(url, commands) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${token}`,
    },
    method: 'PUT',
    body: JSON.stringify(commands),
  });

  if (response.ok) {
    console.log('Registered all commands');
  } else {
    console.error('Error registering commands');
    let errorText = `Error registering commands \n ${response.url}: ${response.status} ${response.statusText}`;
    try {
      const error = await response.text();
      if (error) {
        errorText = `${errorText} \n\n ${error}`;
      }
    } catch (err) {
      console.error('Error reading body from request:', err);
    }
    console.error(errorText);
  }
}
