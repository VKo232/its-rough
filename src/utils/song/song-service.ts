import { getPlayer, playerAddTracks } from "../player/player-service";
import * as spotapi from "./spotify-api";
import * as youtubeapi from "./youtube-api";

export const addSongs = async ({
  guildID,
  args,
}: {
  guildID: string;
  args: string[];
}) => {
  try {
    // parse argument string
    if (!(args.length > 0 && args[0].trim() !== "")) {
      return 1;
    }
    const player = await getPlayer(guildID);
    if (!player) {
      console.log("ERROR: cant get player");
      return 2;
    }
    const parsed_song: ParsedSongType | null = parseArguments(args);
    // send arguments to be handled by the song handler
    if (!parsed_song) {
      return 3;
    }
    const tracks = await getTracks(parsed_song);
    await playerAddTracks(guildID, tracks);
    return 0;
  } catch (err) {
    console.log("ERROR: addSongs", err);
    return 4;
  }
};

// checks if the link is spotify, youtube, otherwise search for it
const parseArguments = (args: string[]) => {
  const spotPattern =
    /^https?:\/\/open\.spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)(\?.*)?$/;
  const youPattern =
    /(?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:youtube\.com|youtu\.be)\/(watch\?v=[a-zA-Z0-9_-]+|playlist\?list=[a-zA-Z0-9_-]+)(\&.*)?$/;
  let parsed = null;
  if (spotPattern.test(args[0])) {
    const match = args[0].match(spotPattern);
    if (match) {
      parsed = {
        requestType: "spotify",
        link: args[0],
      };
    }
  } else if (youPattern.test(args[0])) {
    const match = args[0].match(youPattern);
    if (match) {
      parsed = {
        requestType: "youtube",
        link: args[0],
      };
    }
  } else {
    parsed = {
      requestType: "search",
      link: args.join(" "),
    };
  }
  return parsed;
};

/*
Adds all songs from the list into the db
*/
const getTracks = async (parsedSong: ParsedSongType) => {
  let tracks: ITrack[] = [];
  if (parsedSong.requestType === "spotify") {
    console.log("getting spotify track");
    tracks = await spotapi.getSpotifyTracks(parsedSong.link);
    console.log("got spotify tracks", tracks.length);
  } else if (parsedSong.requestType === "youtube") {
    console.log("getting youtube tracks");
    tracks = await youtubeapi.getYTTracks(parsedSong.link);
    console.log("got spotify tracks", tracks.length);
  } else if (parsedSong.requestType === "search") {
    console.log("searching for yt track");
    tracks = await youtubeapi.searchYTlink(parsedSong.link);
    console.log("got yt track");
  }
  return tracks;
};
