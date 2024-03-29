import {
  createAudioPlayer,
  AudioPlayerStatus,
  AudioPlayer,
  getVoiceConnection,
  createAudioResource,
  NoSubscriberBehavior,
  AudioResource,
} from "@discordjs/voice";
import play, { YouTubeStream } from "play-dl";
import { sendMessage } from "../bot/bot-service";
import { NowPlayingListener } from "../misc/nowPlayingListener";
import { getYTlink } from "../song/youtube-api";

export class CustomPlayer {
  private guildID: string;
  private audioPlayer: AudioPlayer | null = null;
  private queue: ITrack[] = [];
  private currSong: INowPlaying | null = null;
  private volume: number = 0.27;
  private resource: AudioResource | null = null;
  private nowPlayingListener: NowPlayingListener | null | undefined;
  private loop: Boolean = false;
  private loopSong: Boolean = false;

  private constructor(guildID: string, listener: NowPlayingListener | null) {
    console.log("creating player");
    this.guildID = guildID;
    this.setupAudioPlayer();
    this.nowPlayingListener = listener;
  }
  public static async createPlayer(guildID:string) {
    const listener = await NowPlayingListener.createNowPlayingListener(guildID);

    return new CustomPlayer(guildID,listener);
  }

  public add = async (tracks: ITrack[]) => {
    console.log("adding tracks", tracks.length);
    await this.setupAudioPlayer();
    this.queue = this.queue.concat(tracks);
    console.log("added tracks", tracks.length);
    if (!this.currSong) {
      console.log("keeping it up, add more songs");
      await this.playNext();
    }
  };

  private async setupAudioPlayer() {
    console.log("setting up audio player");
    if (this.audioPlayer) {
      const connection = getVoiceConnection(this.guildID);
      connection?.subscribe(this.audioPlayer);
      return;
    }
    this.audioPlayer = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });
    const connection = getVoiceConnection(this.guildID);
    if (!connection || !this.audioPlayer) {
      console.log("no connection or audio player D:");
      return;
    }
    connection.subscribe(this.audioPlayer);
    this.audioPlayer.on("error", async (error) => {
      console.error(`Error: with resource `);
      await this.playNext();
    });
    this.audioPlayer.on(AudioPlayerStatus.Idle, async () => {
      console.log("audio player idling");
      setTimeout(async () => {
        if (this.audioPlayer?.state.status === AudioPlayerStatus.Idle) {
          if (this.loopSong && this.currSong) {
            const track: ITrack = {
              name: this.currSong.name,
              artists: this.currSong.artists,
              source: this.currSong.source
            };
            this.queue.unshift(track);
          }
    
          if (this.loop && this.currSong) {
            const track: ITrack = {
              name: this.currSong.name,
              artists: this.currSong.artists,
              source: this.currSong.source
            };
            this.queue.push(track);
          }
          
          this.currSong = null;
          await this.playNext();
        }
      }, 500); // wait for .5s before skipping
    });
    this.audioPlayer.on(AudioPlayerStatus.Playing, () => {
      console.log("playing");
    });
    this.audioPlayer.on(AudioPlayerStatus.Buffering, () => {
      console.log("audio player buffering");
    });
    this.audioPlayer.on(AudioPlayerStatus.Paused, () => {
      console.log("audio player paused");
    });
    console.log("done setting up");
  }

  private async playNext() {
    console.log("play next pls", this.queue.length);
    if (!this.queue.length) {
      return;
    }
    do {
      let newSong = this.queue.shift();
      if (!newSong) {
        return;
      }
      console.log("wow its ", newSong.name);

      let ytlink = await getYTlink(newSong);
      if (ytlink) {
        try {
          console.log("got yt link", ytlink);
          this.setCurrSong({ ...newSong, ytlink });
          let stream = await play.stream(ytlink, {
            discordPlayerCompatibility: true,
          });
          this.playSong(stream);
        } catch(err) {
          console.log("error getting song", newSong);
          sendMessage({
            message: "can't play " + newSong.name,
            guildID: this.guildID,
          });
        } 
      } else {
        console.log("error getting song", newSong);
        sendMessage({
          message: "can't play " + newSong.name,
          guildID: this.guildID,
        });
      }
    } while (this.currSong == null && this.queue.length);
  }
  private async setCurrSong(song: INowPlaying) {
    this.currSong = song;
    this.nowPlayingListener?.onNewSong(song);
  }
  private async playSong(stream: YouTubeStream) {
    let resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true,
    });
    resource.volume?.setVolume(Math.pow(this.volume, 0.5 / Math.log10(2)));
    await this.setupAudioPlayer();
    if (this.audioPlayer) {
      console.log("playing audio resource");
      this.cleanResource();
      this.audioPlayer.play(resource);
    }
    console.log("trying best to play");
  }
  private cleanResource() {
    this.resource?.playStream.destroy();
    this.resource?.playStream.read();
  }
  public async skip() {
    this.loopSong = false;
    this.audioPlayer?.stop();
  }
  public clearQueue() {
    this.queue = [];
  }
  public nowPlaying() {
    return this.currSong;
  }
  public pause() {
    this.audioPlayer?.pause();
  }
  public unpause() {
    this.audioPlayer?.unpause();
  }
  public getQueue() {
    return this.queue;
  }
  public remove(index: number) {
    this.queue.splice(index - 1, 1)
  }
  public move(index: number) {
    const track = this.queue[index - 1];
    this.queue.splice(index - 1, 1);
    this.queue.unshift(track);
  }
  public loopQueue() {
    this.loop = !this.loop;
    this.loopSong = false;
  }
  public loopCurrSong() {
    this.loopSong = !this.loopSong;
  }
  destroy() {
    this.loop = false;
    this.loopSong = false;
    this.audioPlayer?.stop();
    this.queue = [];
    this.nowPlayingListener?.onDelete();
    this.cleanResource();
  }
}
