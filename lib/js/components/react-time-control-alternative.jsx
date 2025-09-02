import React, { useMemo } from 'react';
import { useMetamodel } from './react-integration.jsx';
import './react-time-control/react-time-control.css';

// Format time as HH:MM:SS.SSS
// input is in seconds
function formatTime(time) {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);
  const milliseconds = Math.floor((time % 1) * 100);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`;
}

function UIReactTimeControl({tPath, playingPath, durationPath}) {
  const dependencies = useMemo(() => {
          return [
                [tPath, 'currentT']
              , [playingPath, 'playing']
              , [durationPath, 'duration']
          ];
      }, [])
    , [{ currentT, playing, duration }, widgetBridge] = useMetamodel(dependencies)
    ;

  const setPlaying = () => {
        widgetBridge.changeState(()=>{
            const playing = widgetBridge.getEntry(playingPath);
            playing.value = !playing.value;
        });
    };

  const handleSliderChange = (event) => {
    const newT = parseFloat(event.target.value);
    widgetBridge.changeState(()=>{
            const t = widgetBridge.getEntry(tPath);
            t.value = newT;
    });
  };

  const handlePlayPauseClick = () => {
    setPlaying(!playing.value);
  };

  return (
    <div className="react-time-control">
      <div className="react-time-control__controls">
        <button
          className={`react-time-control__button ${playing.value ? "react-time-control__button--playing" : "react-time-control__button--paused"}`}
          onClick={handlePlayPauseClick}
          aria-label={playing.value ? "Pause animation" : "Play animation"}
        >
          {playing.value ? "⏸ Pause" : "▶ Play"}
        </button>
        <span className="react-time-control__time-display">
          Clock: {formatTime(duration.value * currentT.value)}
        </span>
      </div>
      <div className="react-time-control__slider-container">
        <label
          htmlFor="react-time-control-slider"
          className="react-time-control__slider-label"
        >
          Time Position:
        </label>
        <input
          id="react-time-control-slider"
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={currentT.value}
          onChange={handleSliderChange}
          className="react-time-control__slider"
          aria-label="Time position slider"
        />
      </div>
    </div>
  );
}

export { UIReactTimeControl };
