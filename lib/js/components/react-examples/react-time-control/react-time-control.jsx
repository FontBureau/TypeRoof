import React, { useCallback } from "react";
import { useMetamodelSimpel as useWidgetState } from "../../react-integration.jsx";
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

  const handleSliderChange = useCallback((event) => {
    const newT = parseFloat(event.target.value);
    setT(newT);
  });

  const handlePlayPauseClick = useCallback(() => {
    setPlaying(!playing);
  });

  // Provide default values if undefined
  const currentT = t ?? 0;
  const isPlaying = playing ?? false;

  return (
    <div className="react-time-control">
      <div className="react-time-control__controls">
        <button
          aria-label={isPlaying ? "Pause animation" : "Play animation"}
          className={`react-time-control__button ${isPlaying ? "react-time-control__button--playing" : "react-time-control__button--paused"}`}
          onClick={handlePlayPauseClick}
          type="button"
        >
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>

        <span className="react-time-control__time-display">
          Clock: {formatTime(duration * currentT)}
        </span>
      </div>

      <div className="react-time-control__slider-container">
        <label
          className="react-time-control__slider-label"
          htmlFor="react-time-control-slider"
        >
          Time Position:
        </label>

        <input
          aria-label="Time position slider"
          className="react-time-control__slider"
          id="react-time-control-slider"
          max="1"
          min="0"
          onChange={handleSliderChange}
          step="0.001"
          type="range"
          value={currentT}
        />
      </div>
    </div>
  );
}

export { UIReactTimeControl };
