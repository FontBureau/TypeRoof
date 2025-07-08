import React from "react";
import { useWidgetState, createReactBridge } from "../react-bridge.jsx";
import "./react-time-control.css";

// Format time as HH:MM:SS.SSS
// input is in seconds
function formatTime(time) {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);
  const milliseconds = Math.floor((time % 1) * 100);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}`;
}

function UIReactTimeControl() {
  const [t, setT] = useWidgetState("t");
  const [playing, setPlaying] = useWidgetState("playing");
  const [duration] = useWidgetState("duration");

  const handleSliderChange = (event) => {
    const newT = parseFloat(event.target.value);
    setT(newT);
  };

  const handlePlayPauseClick = () => {
    setPlaying(!playing);
  };

  // Provide default values if undefined
  const currentT = t ?? 0;
  const isPlaying = playing ?? false;

  return (
    <div className="react-time-control">
      <div className="react-time-control__controls">
        <button
          className={`react-time-control__button ${isPlaying ? "react-time-control__button--playing" : "react-time-control__button--paused"}`}
          onClick={handlePlayPauseClick}
          aria-label={isPlaying ? "Pause animation" : "Play animation"}
        >
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>
        <span className="react-time-control__time-display">
          Clock: {formatTime(duration * currentT)}
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
          value={currentT}
          onChange={handleSliderChange}
          className="react-time-control__slider"
          aria-label="Time position slider"
        />
      </div>
    </div>
  );
}

export { UIReactTimeControl };
