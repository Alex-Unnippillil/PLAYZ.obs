// SPDX-License-Identifier: GPL-2.0-or-later
import { useId } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { duration } from '../lib/format';
import type { TrimRange } from '../lib/trimHistory';
import './TrimTimeline.css';

export function TrimTimeline({ range, totalMs, positionMs, disabled, onPreview, onCommit, onCancel }: {
  range: TrimRange; totalMs: number; positionMs: number; disabled: boolean;
  onPreview: (range: TrimRange) => void; onCommit: () => void; onCancel: () => void;
}) {
  const description = useId();
  const total = Number.isFinite(totalMs) && totalMs >= 250 ? totalMs / 1000 : 0;
  const valid = total > 0 && Number.isFinite(range.start) && Number.isFinite(range.end)
    && range.start >= 0 && range.end <= total && range.end - range.start >= 0.25 - 1e-9;
  const values = valid ? [range.start, range.end] : [0, total];
  const playhead = Number.isFinite(positionMs) && totalMs > 0 ? Math.min(100, Math.max(0, positionMs / totalMs * 100)) : 0;
  return <section className="trim-timeline" aria-label="Visual clip selection">
    <div className="timeline-heading"><strong>Selection timeline</strong><span className="muted small">Original remains unchanged</span></div>
    <div className="timeline-track-wrap">
      <Slider.Root className="trim-slider" min={0} max={Math.max(total, 0.25)} step={0.001} minStepsBetweenThumbs={250}
        value={values} disabled={disabled || !valid} aria-describedby={description}
        onValueChange={next => { if (next.length === 2) onPreview({ start: next[0]!, end: next[1]! }); }}
        onValueCommit={onCommit} onPointerCancel={onCancel} onLostPointerCapture={onCommit}
        onBlur={onCommit}>
        <Slider.Track className="trim-slider-track"><Slider.Range className="trim-slider-range"/></Slider.Track>
        <Slider.Thumb className="trim-slider-thumb" aria-label="Selection start" aria-valuetext={`${values[0]!.toFixed(3)} seconds`} />
        <Slider.Thumb className="trim-slider-thumb" aria-label="Selection end" aria-valuetext={`${values[1]!.toFixed(3)} seconds`} />
      </Slider.Root>
      <span className="timeline-playhead" style={{ left: `${playhead}%` }} aria-hidden="true"/>
    </div>
    <div className="timeline-ruler" aria-hidden="true"><span>00:00</span><span>{duration(totalMs / 2)}</span><span>{duration(totalMs)}</span></div>
    <p id={description} className="small muted">Drag either handle or use arrow keys. Numeric fields below provide precise timestamps, not frame-accurate preview.{!valid && ' Correct the timestamps or choose Full recording to enable the timeline.'}</p>
  </section>;
}
