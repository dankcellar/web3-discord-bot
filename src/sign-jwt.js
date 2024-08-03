import { config } from 'dotenv';
import { sign } from 'hono/jwt';

config({ path: '.dev.vars' });

const userId = 217775277349011456;
const guildId = 1062603620887044166;
const username = 'datboi1337';
const permissions = 8;
const avatar = '';

sign({ userId, guildId, username, permissions, avatar }, process.env.AUTH_SECRET)
  .then((token) => {
    const url =
      'https://rarity.bot/roles/#token_type=Bearer&access_token=a0t5bLMMkCu0TWkj3hPLwM8qH0Rcjt&expires_in=604800&scope=applications.commands+identify&state=' +
      token;
    console.log(url);
  })
  .catch((err) => {
    console.error(err);
  });
