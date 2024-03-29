// https://www.npmjs.com/package/ytdl-core

import { youtube_v3 } from "googleapis";
import * as cheerio from 'cheerio';
import { YoutubeQuotaManager } from "./quota-manager";
import axios from 'axios'

const youPattern =
  /^https?:\/\/(www\.)?youtube\.com\/(watch\?v=[a-zA-Z0-9_-]+|playlist\?list=[a-zA-Z0-9_-]+)(\&.*)?$/;

const youtube = new YoutubeQuotaManager();

/*
Given querystring, search for a youtube link 
*/
export const searchYTlink = async (query: string): Promise<ITrack[]> => {
  const videos: ITrack[] = [];
  try {
    if (query === "") {
      return [];
    }
    query += ' lyrics audio'
    const url = new URL(`https://www.youtube.com/results`);
    url.searchParams.set('search_query', query);
    const html = await axios.get(url.href);

    const $ = cheerio.load(html.data);

    const vIdIndex = $.html().indexOf("\"videoRenderer\":{\"videoId\":\"");
    if (vIdIndex == -1) {
      throw new Error('No Results Found');
    }
    const videoId = $.html().substring(vIdIndex + 28, $.html().indexOf("\"", vIdIndex + 28))
    
    const titleIndex = $.html().indexOf("\"title\":{\"runs\":[{\"text\":\"", vIdIndex);
    const title = $.html().substring(titleIndex + 26, $.html().indexOf("\"", titleIndex + 26))

    const channelIndex = $.html().indexOf("\"longBylineText\":{\"runs\":[{\"text\":\"", titleIndex);
    const channelTitle = $.html().substring(channelIndex + 35, $.html().indexOf("\"", channelIndex + 35))
    
    videos.push({
      name: title,
        artists: [channelTitle],
        source: `https://www.youtube.com/watch?v=${
                    videoId
                }`,
    })

    return videos;

  } catch (err) {
    return await fallbackSearchYTLink(query);
  }
};

/*
Searches for a video using official youtube api
*/
export const fallbackSearchYTLink = async (query: string): Promise<ITrack[]>  => {
  console.log("fallback")
  const videos: ITrack[] = [];
  try {
    const searchParams = {
      part: ["id", "snippet"],
      type: ["video"],
      q: query,
      maxResults: 1,
    };
    // const res = await youtube.search.list(searchParams);
    const res = await youtube.search().list(searchParams);
    if (res?.data?.items && res?.data?.items[0]) {
      const firstResult = res.data.items[0];
      if (firstResult.snippet?.title && firstResult.snippet?.channelTitle) {
        return [
          {
            name: firstResult!.snippet!.title,
            artists: [firstResult!.snippet!.channelTitle],
            source: `https://www.youtube.com/watch?v=${
              firstResult!.id!.videoId
            }`,
          },
        ];
      }
    }
    return videos;
  } catch (err) {
    console.log("error getting yt link for ", query);
    youtube.rotateKey();
    return [];
  }
}
/*
Given a track, searches for the first result link from youtube
*/
export const getYTlink = async (track: ITrack): Promise<string> => {
  try {
    console.log("getting yt link praying", track.name);
    // check if type of link is youtube then do nothing
    if (youPattern.test(track.source)) {
      return track.source;
    }
    const query = `"${track.name}"  "${track.artists.join('" "')}"`;
    const qdata = await searchYTlink(query);
    if (qdata?.length) {
      return qdata[0].source;
    }
  } catch (err) {
    console.log("error getting ytlink", err);
  }
  return "";
};

function isPlaylistLink(link: string): boolean {
  return link.includes("playlist?list=");
}

function isVideoLink(link: string): boolean {
  return link.includes("watch?v=");
}

function isVideoInPlaylist(link: string): boolean {
  return link.includes("watch?v=") && link.includes("list=");
}
/*
Get playlist id given a link
*/
function getPlaylistId(link: string): string | null {
  if (isPlaylistLink(link)) {
    const match = link.match(/playlist\?list=(.*)/);
    if (match) {
      return match[1];
    }
  } else if (isVideoInPlaylist(link)) {
    const match = link.match(/list=(.*?)(&|$)/);
    if (match) {
      return match[1];
    }
  }
  return null;
}
/*
Get video id from youtube link
*/
const getVideoId = (link: string): string | null => {
  if (isVideoLink(link)) {
    const match = link.match(/watch\?v=(.*?)(&|$)/);
    if (match) {
      return match[1];
    }
  } else if (isVideoInPlaylist(link)) {
    const match = link.match(/watch\?v=(.*?)&/);
    if (match) {
      return match[1];
    }
  }
  return null;
};

/*
Get tracks from playlist id
*/
const getVideosFromPlaylist = async (playlistId: string): Promise<ITrack[]> => {
  let tracks: ITrack[] = [];
  let count = 0;
  let nextPageToken: string | null | undefined = undefined;
  do {
    count++;
    const { data }: any = await youtube.playlistItems().list({
      part: ["snippet"],
      playlistId: playlistId,
      maxResults: 50,
      pageToken: nextPageToken,
    });
    if (!data?.items) {
      nextPageToken = null;
      continue;
    }
    const newTracks: ITrack[] | undefined = data?.items?.map((item: any) => {
      const { title, channelTitle } = item?.snippet || {};
      return {
        name: title,
        artists: [channelTitle],
        source: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
      };
    });
    if (newTracks) {
      tracks = tracks.concat(newTracks);
      nextPageToken = data.nextPageToken;
    } else {
      nextPageToken = null;
    }
  } while (nextPageToken && count < 3);

  return tracks;
};

/*
Get tracks from a comma separated list of videoIds. 
*/
const getVideosFromVideo = async (videoId: string): Promise<ITrack[]> => {
  const tracks: ITrack[] = [];
  const videosParams: youtube_v3.Params$Resource$Videos$List = {
    part: ["snippet"],
    id: [videoId],
  };

  const videosResponse = await youtube.videos().list(videosParams);
  if (videosResponse?.data?.items) {
    videosResponse.data.items.forEach((video) => {
      if (video?.snippet?.title && video?.snippet?.channelTitle) {
        const track: ITrack = {
          name: video.snippet.title,
          artists: [video.snippet.channelTitle],
          source: `https://www.youtube.com/watch?v=${videoId}`,
        };
        tracks.push(track);
      }
    });
  }
  return tracks;
};

/*
Given a youtube link, return the list of videos that are associated with that link (video/playlist)
*/
export const getYTTracks = async (link: string): Promise<ITrack[]> => {
  try {
    let tracks: ITrack[] = [];
    if (
      isPlaylistLink(link) ||
      (isVideoInPlaylist(link) && getPlaylistId(link))
    ) {
      console.log("playlist wooo");
      tracks = await getVideosFromPlaylist(getPlaylistId(link)!);
    } else if (isVideoLink(link) && getVideoId(link)) {
      console.log("a single pringle");
      tracks = await getVideosFromVideo(getVideoId(link)!);
    }
    return tracks;
  } catch (err) {
    console.log("error getting yttracks", link);
    youtube.rotateKey();
  }
  return [];
};
