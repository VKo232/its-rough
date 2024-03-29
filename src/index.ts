import { Client, Collection, GatewayIntentBits } from "discord.js";
import { readdirSync } from "fs";
import { join } from "path";

import mongoose from "mongoose";
import { Config } from "./config";

interface LoaderClient {
  client: Client;
  commands: Collection<any, any>;
}

const options = {
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessageReactions,
  ],
};

export const client: LoaderClient = {
  client: new Client(options),
  commands: new Collection(),
};

mongoose.set("strictQuery", false);
mongoose.connect(Config.MONGODB_URI!, { dbName: Config.DB_NAME });

const loadCommands = (directory: string) => {
  readdirSync(directory)
    .filter((file) => file.endsWith(".ts"))
    .forEach((file) => {
      const command = require(join(directory, file));
      if ("data" in command && "execute" in command) {
        client.commands.set(command.data.name, command);
        if ("aliases" in command) {
          command.aliases.forEach((alias: string) => {
            client.commands.set(alias, command);
          });
        }
      } else {
        console.log(
          `[WARNING] The command at ${file} is missing a required "data" or "execute" property.`
        );
      }
    });
};

const loadEvents = (directory: string) => {
  readdirSync(directory)
    .filter((file) => file.endsWith(".ts"))
    .forEach((file) => {
      const event = require(join(directory, file));
      if (event.once) {
        client.client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.client.on(event.name, (...args) => event.execute(...args));
      }
    });
};
console.log("load Commands");
loadCommands(join(__dirname, "commands"));
console.log("load events");
loadEvents(join(__dirname, "events"));
console.log("login");
client.client
  .login(Config.token)
  .then(() => {
    console.log("logged in returned");
  })
  .catch((err) => {
    console.log(err);
  });
