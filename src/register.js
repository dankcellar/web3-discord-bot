import { config } from 'dotenv';

import Commands from './commands.js';

config({ path: '.dev.vars' });

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
  await makeRequest(url, commands);

  const url2 = `https://discord.com/api/v10/applications/${applicationId}/role-connections/metadata`;
  // supported types: number_lt=1, number_gt=2, number_eq=3 number_neq=4, datetime_lt=5, datetime_gt=6, boolean_eq=7, boolean_neq=8
  const body = [
    {
      key: 'wallets',
      name: 'Wallets Connected',
      description: 'Have at least one wallet connected to the bot',
      type: 2,
    },
    // {
    //   key: 'first',
    //   name: 'First Users Verified',
    //   description: 'Users verified in this guild first',
    //   type: 1,
    // },
  ];

  await makeRequest(url2, body);
} catch (err) {
  console.error(err);
}

async function makeRequest(url, body) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${token}`,
    },
    method: 'PUT',
    body: JSON.stringify(body),
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
