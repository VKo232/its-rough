import { Client, Message, SlashCommandBuilder } from "discord.js";
import { emojiReact } from "../utils/bot/bot-service";
import { hasPlayer, playerRemove, playerGetQueue} from "../utils/player/player-service";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Removes the song"),
  aliases: ["rm"],
  async execute(client: Client, message: Message, args: any) {
    console.log(
      `>>>Remove user: ${message.author.username} in guild: ${message.guild?.name}`
    );
    if (!message.guild?.id) {
      return;
    }
    const length = playerGetQueue(message.guild?.id).length;
    if (message.guild?.id && hasPlayer(message.guild?.id) && args.length == 1 && parseInt(args[0]) - 1 <= length && parseInt(args[0]) > 0) {
        emojiReact({message,emoji:"ok_hand"});
        playerRemove(message.guild?.id, parseInt(args[0]));
    } else {
      message.reactions.removeAll().catch();
      emojiReact({message,emoji:"poop"});
    }
  },
};
