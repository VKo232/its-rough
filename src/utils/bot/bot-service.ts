import { Message, TextChannel } from "discord.js";
import GuildModel from "../../models/Guild";

import {
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { InternalDiscordGatewayAdapterCreator } from "discord.js";
import { client } from "../../index";
import { playerDestroy } from "../player/player-service";
import { getEmoji } from "../misc/emojiMapper";

declare interface reactEmojiProp {
  message: Message;
  emoji: string; // Should be a string of the name, formatting will be done with the func
}


export const emojiReact = async ({ message, emoji }: reactEmojiProp) => {
  // there should be a much more rich library for getting custom emojis and a mapper
  // to get the fun emotes
  // check if there is a way to get the emotes from a cache as well
  
  // check if default emojis
  try {
    let emojiString = getEmoji(emoji);
    if(emojiString) message.react(emojiString);
  } catch(err) {
    console.log("emoji not found", err)
  }
};

export const sendMessage = async ({
  message,
  guildID,
  textChannel,
}: sendMessageProp) => {
  if (message !== "") {
    if (textChannel && client?.client?.channels?.cache?.get(textChannel)) {
      (client.client.channels.cache.get(textChannel) as TextChannel).send(
        message
      );
    } else {
      const guild = await GuildModel.findOne({ guildId: guildID });
      if (guild?.textChannelId) {
        (
          client.client.channels.cache.get(guild?.textChannelId) as TextChannel
        ).send(message);
      }
    }
  }
};

export const isInChannel = async (guildID: string): Promise<boolean> => {
  const guild = await GuildModel.findOne({ guildId: guildID });
  return guild?.voiceChannelId !== "";
};

export const joinChannel = async (
  voiceChannelID: string,
  guildID: string,
  voiceAdapterCreator: InternalDiscordGatewayAdapterCreator,
  textChannelID: string
) => {
  console.log("joining channel");
  // check if connection exists before joining call
  const connection = getVoiceConnection(guildID);
  if (!connection) {
    const guild = await GuildModel.findOneAndUpdate(
      { guildId: guildID },
      { voiceChannelId: voiceChannelID, textChannelId: textChannelID },
      { new: true, upsert: true }
    );
    if (
      !guild.voiceChannelId &&
      client?.client?.channels?.cache?.get(textChannelID)
    ) {
      (client.client.channels.cache.get(textChannelID) as TextChannel).send(
        "no channel or server??"
      );
      console.log("no channel or guildID");
      return;
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannelID,
      guildId: guildID,
      adapterCreator: voiceAdapterCreator,
    });
    // patch for https://github.com/discordjs/discord.js/issues/9185
    connection.on("stateChange", (oldState, newState) => {
      const oldNetworking = Reflect.get(oldState, "networking");
      const newNetworking = Reflect.get(newState, "networking");

      const networkStateChangeHandler = (
        oldNetworkState: any,
        newNetworkState: any
      ) => {
        const newUdp = Reflect.get(newNetworkState, "udp");
        clearInterval(newUdp?.keepAliveInterval);
      };

      oldNetworking?.off("stateChange", networkStateChangeHandler);
      newNetworking?.on("stateChange", networkStateChangeHandler);
    });

    connection.on(
      VoiceConnectionStatus.Disconnected,
      async (oldState, newState) => {
        console.log("Disconnected from ", guildID);

        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
          // Seems to be reconnecting to a new channel - ignore disconnect
        } catch (error) {
          // Seems to be a real disconnect which SHOULDN'T be recovered from
          connection.destroy();
          playerDestroy(guildID);
        }
      }
    );
  }
};

export const leaveChannel = async (guildID: string) => {
  console.log("leaving channel");
  const guild = await GuildModel.findOneAndUpdate(
    { guildId: guildID },
    { voiceChannelId: undefined, textChannelId: undefined },
    { new: true }
  );
  const connection = getVoiceConnection(guildID);
  playerDestroy(guildID);
  if (connection) {
    await connection.destroy(); // disconnect
  }

  console.log(`Left ${guild?.voiceChannelId} in ${guild?.guildId}`);
};
