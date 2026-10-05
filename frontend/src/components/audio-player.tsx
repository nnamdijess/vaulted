"use client";

import { Waveform } from "./waveform";
import Link from "next/link";
import { usePathname } from 'next/navigation';
import { Modal } from "./modal";
import { PlayerIcon } from "./player-icon";
import { FavoriteButton } from "./favorite-button";
import { useAuth } from "./auth-provider";
import { PlaybackOrder, RepeatMode } from "@/lib/playback-order";
import {
  createContext,
  useContext,
  useSyncExternalStore,
  useRef,
  useState,
} from "react";
import { apiUrl, Project, projectCoverUrl, Song } from "@/lib/api";
import { usePlaybackInsights } from "@/lib/playback-insights";

export type QueueTrack = {
  songId: number;
  title: string;
  artist: string;
  fallbackArtist?: string;
  usesOwnerName?: boolean;
  versionName?: string | null;
  versionId: number;
  publicToken?: string;
  projectId?: number;
  coverUrl?: string;
};

export function trackFor(
  song: Song,
  project?: Project | null
): QueueTrack | null {
  return song.latest_version_id
    ? {
        songId: song.id,
        title: song.title,
        artist: song.artist,
        fallbackArtist: project?.artist || project?.owner_name || "",
        usesOwnerName: !project?.artist,
        versionName: song.latest_version_name,
        versionId: song.latest_version_id,
        projectId: song.project_id,
        coverUrl: projectCoverUrl(project),
      }
    : null;
}

type Player = {
  elapsed: number;
  previewError: string;
  beginStudio: (versionId: number, start: number, end: number) => void;
  stopStudio: () => void;
  pause: () => void;
  seek: (time: number) => void;
  current: QueueTrack | null;
  playing: boolean;
  playQueue: (tracks: QueueTrack[], index?: number) => void;
  toggle: () => void;
  updateSong: (song: Song) => void;
  updateProject: (project: Project) => void;
  reorderProject: (projectId: number, songIds: number[]) => void;
  removeSong: (songId: number) => void;
  removeSongs: (songIds: number[]) => void;
};

const Context = createContext<Player | null>(null);
const subscribeMounted = () => () => {};

export function usePlayer() {
  const player = useContext(Context);

  if (!player) {
    throw new Error("AudioPlayerProvider is required");
  }

  return player;
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(
    Math.floor(seconds % 60)
  ).padStart(2, "0")}`;
}

function PlayerArtwork({
  src,
  title,
}: {
  src?: string;
  title: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span className="mini-cover">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`Cover for ${title}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">♫</span>
      )}
    </span>
  );
}

export function AudioPlayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const pathname = usePathname();

  const audio = useRef<HTMLAudioElement>(null);
  const studioPendingSeek = useRef<number | null>(null);
  const studio = useRef<{ start: number; end: number; previousSource: string; previousTime: number } | null>(null);
  const [studioActive, setStudioActive] = useState(false);
  const order = useRef(new PlaybackOrder());

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [expanded, setExpanded] = useState(false);

  const queueRef = useRef<QueueTrack[]>([]);
  const indexRef = useRef(0);
  const playbackRequest = useRef(0);

  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");

  const mounted = useSyncExternalStore(subscribeMounted, () => true, () => false);

  const current = queue[index] ?? null;

  const canPlay = Boolean(current);
  const canPrevious = Boolean(current && order.current.canPrevious);
  const canNext = Boolean(current && order.current.canNext);

  const artist = current
    ? current.artist ||
      (current.usesOwnerName && !current.publicToken
        ? user?.display_name
        : current.fallbackArtist) ||
      "Unknown artist"
    : "Choose a track to listen";

  const insights = usePlaybackInsights();

  const waveformEndpoint = current
    ? current.publicToken
      ? `/api/public/${encodeURIComponent(
          current.publicToken
        )}/songs/${current.songId}/waveform?version_id=${current.versionId}`
      : apiUrl(`/versions/${current.versionId}/waveform`)
    : null;

  function resume() {
    const element = audio.current;

    if (!element) return;

    setError("");

    void element.play().catch((err: Error) => {
      if (err.name !== "AbortError") {
        setError(
          "Playback could not start. Press play to retry or choose another track."
        );
      }
    });
  }

  function beginStudio(versionId: number, start: number, end: number) {
    const element = audio.current;
    if (!element) return;
    const previous = studio.current;
    studio.current = { start, end, previousSource: previous?.previousSource ?? element.src, previousTime: previous?.previousTime ?? element.currentTime };
    element.pause();
    setExpanded(false);
    setStudioActive(true);
    const source = apiUrl(`/versions/${versionId}/audio`);
    if (element.getAttribute('src') !== source) element.src = source;
    if (element.readyState >= 1) {
      element.currentTime = start;
      studioPendingSeek.current = null;
    } else {
      // Some browsers cannot apply a nonzero seek before metadata is available.
      studioPendingSeek.current = start;
    }
    setElapsed(start);
    resume();
  }

  function stopStudio() {
    const element = audio.current;
    const preview = studio.current;
    if (!element || !preview) return;
    element.pause();
    studioPendingSeek.current = null;
    studio.current = null;
    setStudioActive(false);
    if (preview.previousSource) {
      element.src = preview.previousSource;
      element.currentTime = preview.previousTime;
    } else {
      element.removeAttribute('src');
      element.load();
    }
    setElapsed(preview.previousTime);
  }

  function loadTrack(
    tracks: QueueTrack[],
    start = 0,
    autoPlay = true
  ) {
    if (!tracks[start] || !audio.current) return;

    queueRef.current = tracks;
    indexRef.current = start;

    setQueue(tracks);
    setIndex(start);
    setElapsed(0);
    setDuration(0);
    setError("");

    const track = tracks[start];

    const publicBase = track.publicToken
      ? `/api/public/${encodeURIComponent(
          track.publicToken
        )}/songs/${track.songId}`
      : null;

    insights.begin(
      publicBase
        ? `${publicBase}/listens`
        : apiUrl(`/songs/${track.songId}/listens`)
    );

    const source = publicBase
      ? `${publicBase}/audio?version_id=${track.versionId}`
      : apiUrl(`/versions/${track.versionId}/audio?play=1`);

    audio.current.src = `${source}&playback=${++playbackRequest.current}`;

    if (autoPlay) {
      resume();
    } else {
      audio.current.load();
    }
  }

  function playQueue(
    tracks: QueueTrack[],
    start = 0,
    autoPlay = true
  ) {
    if (!tracks[start]) return;
    stopStudio();

    order.current.reset(
      tracks.map((track) => track.songId),
      tracks[start].songId
    );

    loadTrack(tracks, start, autoPlay);
  }

  function toggle() {
    if (!audio.current || !queueRef.current.length) return;

    if (audio.current.ended) {
      loadTrack(queueRef.current, indexRef.current);
    } else if (audio.current.paused) {
      resume();
    } else {
      audio.current.pause();
    }
  }

  function move(offset: number) {
    const id =
      offset < 0
        ? order.current.previous()
        : order.current.next();

    const next = queueRef.current.findIndex(
      (track) => track.songId === id
    );

    if (next >= 0) {
      loadTrack(queueRef.current, next);
    }
  }

  function updateSong(song: Song) {
    queueRef.current = queueRef.current.map((track) =>
      track.songId === song.id
        ? {
            ...track,
            title: song.title,
            artist: song.artist,
          }
        : track
    );

    setQueue(queueRef.current);
  }

  function updateProject(project: Project) {
    queueRef.current = queueRef.current.map((track) =>
      track.projectId === project.id && !track.publicToken
        ? {
            ...track,
            coverUrl: projectCoverUrl(project),
            fallbackArtist:
              project.artist || project.owner_name,
            usesOwnerName: !project.artist,
          }
        : track
    );

    setQueue(queueRef.current);
  }

  function reorderProject(
    projectId: number,
    songIds: number[]
  ) {
    if (
      !queueRef.current.length ||
      queueRef.current.some(
        (track) =>
          track.projectId !== projectId ||
          track.publicToken
      )
    ) {
      return;
    }

    const selected =
      queueRef.current[indexRef.current];

    const positions = new Map(
      songIds.map((id, index) => [id, index])
    );

    queueRef.current = [...queueRef.current].sort(
      (a, b) =>
        (positions.get(a.songId) ?? Infinity) -
        (positions.get(b.songId) ?? Infinity)
    );

    indexRef.current = Math.max(
      0,
      queueRef.current.indexOf(selected)
    );

    order.current.reconcile(
      queueRef.current.map((track) => track.songId)
    );

    setQueue(queueRef.current);
    setIndex(indexRef.current);
  }

  function removeSong(songId: number) {
    removeSongs([songId]);
  }

  function removeSongs(songIds: number[]) {
    const removed = new Set(songIds);

    const oldCurrent =
      queueRef.current[indexRef.current];

    const remaining = queueRef.current.filter(
      (track) => !removed.has(track.songId)
    );

    if (
      oldCurrent &&
      removed.has(oldCurrent.songId)
    ) {
      const wasPlaying = Boolean(
        audio.current && !audio.current.paused
      );

      audio.current?.pause();

      if (remaining.length) {
        playQueue(
          remaining,
          Math.min(
            indexRef.current,
            remaining.length - 1
          ),
          wasPlaying
        );
      } else {
        order.current = new PlaybackOrder();
        order.current.shuffle = shuffle;
        order.current.repeat = repeat;

        queueRef.current = [];
        indexRef.current = 0;

        setIndex(0);
        setQueue([]);
        setElapsed(0);
        setDuration(0);
        setError("");
        setPlaying(false);

        audio.current?.removeAttribute("src");
        audio.current?.load();
      }
    } else {
      queueRef.current = remaining;

      indexRef.current = Math.max(
        0,
        remaining.findIndex(
          (track) => track === oldCurrent
        )
      );

      order.current.reconcile(
        remaining.map((track) => track.songId)
      );

      setQueue(remaining);
      setIndex(indexRef.current);
    }
  }

  return (
    <Context.Provider
      value={{
        current,
        elapsed,
        previewError: error,
        beginStudio,
        stopStudio,
        pause: () => audio.current?.pause(),
        seek: (time) => { if (audio.current) audio.current.currentTime = time; },
        playing,
        playQueue,
        toggle,
        updateSong,
        updateProject,
        reorderProject,
        removeSong,
        removeSongs,
      }}
    >
      {children}

      <aside
        style={studioActive || /^\/studio\/\d+$/.test(pathname) ? { display: 'none' } : undefined}
        className="audio-dock"
        aria-label="Audio player"
      >
        <audio
          ref={audio}
          data-testid="global-audio"
          preload="metadata"
          onLoadedMetadata={() => {
            if (audio.current && studioPendingSeek.current !== null) {
              audio.current.currentTime = studioPendingSeek.current;
              setElapsed(studioPendingSeek.current);
              studioPendingSeek.current = null;
            }
          }}
          onPlay={() => {
            setPlaying(true);

            if (audio.current) {
              insights.resetSample(audio.current);
            }
          }}
          onPause={() => setPlaying(false)}
          onSeeking={() => {
            if (audio.current) {
              insights.resetSample(audio.current);
            }
          }}
          onSeeked={() => {
            if (audio.current) {
              insights.resetSample(audio.current);
            }
          }}
          onTimeUpdate={() => {
            if (studioPendingSeek.current !== null) return;
            setElapsed(
              audio.current?.currentTime ?? 0
            );

            if (audio.current && !studio.current) {
              insights.tick(audio.current);
            }
            if (audio.current && studio.current && audio.current.currentTime >= studio.current.end) {
              audio.current.pause();
              audio.current.currentTime = studio.current.end;
            }
          }}
          onDurationChange={() =>
            setDuration(
              Number.isFinite(audio.current?.duration)
                ? audio.current!.duration
                : 0
            )
          }
          onEnded={() => {
            setPlaying(false);
            if (studio.current) return;

            if (order.current.repeat === "one") {
              loadTrack(
                queueRef.current,
                indexRef.current
              );
            } else {
              move(1);
            }
          }}
          onError={() => {
            setPlaying(false);
            setError(
              "Unable to play this file. Check the backend and browser codec support."
            );
          }}
        />

        <div className="now-playing">
          <button
            className="artwork-trigger"
            aria-label="Open Now Playing"
            disabled={!mounted || !current}
            onClick={() => setExpanded(true)}
          >
            <PlayerArtwork
              key={
                current?.coverUrl ??
                "placeholder"
              }
              src={current?.coverUrl}
              title={
                current?.title ?? "current track"
              }
            />
          </button>

          <div>
            {current ? (
              <button
                className="track-view-trigger"
                onClick={() =>
                  setExpanded(true)
                }
                aria-label={`Now Playing: ${current.title}`}
              >
                {current.title}
              </button>
            ) : (
              <strong>Nothing playing</strong>
            )}

            <small>{artist}</small>
          </div>
        </div>

        {transport()}
        {timeline()}

        {error && (
          <p
            role="alert"
            className="player-error"
          >
            {error}
          </p>
        )}
      </aside>

      {expanded && current && (
        <Modal
          title="Now Playing"
          className="now-playing-dialog"
          onClose={() => setExpanded(false)}
        >
          <div className="expanded-artwork">
            <PlayerArtwork
              key={
                current.coverUrl ??
                "placeholder"
              }
              src={current.coverUrl}
              title={current.title}
            />
          </div>

          <div className="expanded-track-heading">
            <div>
              <h2>{current.title}</h2>
              <p>{artist}</p>

              {current.versionName && (
                <small className="muted">
                  {current.versionName}
                </small>
              )}
            </div>

            {!current.publicToken && user && (
              <FavoriteButton
                key={current.songId}
                songId={current.songId}
              />
            )}
          </div>

          {timeline()}

          <div className="expanded-controls">
            <button
              className="icon-button mode-button"
              aria-label="Shuffle"
              aria-pressed={shuffle}
              onClick={() => {
                order.current.setShuffle(
                  !shuffle
                );

                setShuffle(!shuffle);
              }}
            >
              <PlayerIcon name="shuffle" />
            </button>

            {transport()}

            <button
              className="icon-button mode-button"
              aria-label={`Repeat: ${repeat}`}
              aria-pressed={repeat !== "off"}
              onClick={() => {
                const next: RepeatMode =
                  repeat === "off"
                    ? "all"
                    : repeat === "all"
                    ? "one"
                    : "off";

                order.current.repeat = next;
                setRepeat(next);
              }}
            >
              <PlayerIcon name="repeat" />

              {repeat === "one" && (
                <span className="repeat-one">
                  1
                </span>
              )}
            </button>
          </div>

          <p
            className="playback-mode-status"
            role="status"
          >
            Shuffle {shuffle ? "on" : "off"} ·
            Repeat{" "}
            {repeat === "one"
              ? "one track"
              : repeat === "all"
              ? "queue"
              : "off"}
          </p>

          {error && (
            <p
              role="alert"
              className="error"
            >
              {error}
            </p>
          )}

          {!current.publicToken && (
            <Link
              className="song-details-link"
              href={`/songs/${current.songId}`}
              onClick={() =>
                setExpanded(false)
              }
            >
              View song details
            </Link>
          )}
        </Modal>
      )}
    </Context.Provider>
  );

  function transport() {
    return (
      <div className="transport">
        <button
          {...{ autoComplete: "off" }}
          className="icon-button"
          aria-label="Previous track"
          disabled={!canPrevious}
          onClick={() => move(-1)}
        >
          <PlayerIcon name="previous" />
        </button>

        <button
          {...{ autoComplete: "off" }}
          className="play-button"
          aria-label={
            playing
              ? "Pause playback"
              : "Resume playback"
          }
          disabled={!canPlay}
          onClick={toggle}
        >
          <PlayerIcon
            name={
              playing ? "pause" : "play"
            }
          />
        </button>

        <button
          {...{ autoComplete: "off" }}
          className="icon-button"
          aria-label="Next track"
          disabled={!canNext}
          onClick={() => move(1)}
        >
          <PlayerIcon name="next" />
        </button>
      </div>
    );
  }

  function timeline() {
    return (
      <div className="timeline">
        <span aria-label="Elapsed time">
          {clock(elapsed)}
        </span>

        <Waveform
          key={
            waveformEndpoint ?? "empty"
          }
          endpoint={waveformEndpoint}
          elapsed={elapsed}
          duration={duration}
          onSeek={(time) => {
            if (audio.current) {
              audio.current.currentTime =
                time;

              insights.resetSample(
                audio.current
              );
            }

            setElapsed(time);
          }}
        />

        <span aria-label="Duration">
          {clock(duration)}
        </span>
      </div>
    );
  }
}
