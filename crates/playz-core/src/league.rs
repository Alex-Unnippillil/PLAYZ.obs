// SPDX-License-Identifier: GPL-2.0-or-later
//! Offline match-review foundations only. No production network client or
//! automatic recording is enabled until the local TLS/session/hardware gates pass.
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Anchor {
    pub game_seconds: f64,
    pub media_ms: f64,
    pub uncertainty_ms: f64,
}
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MappedTime {
    pub media_ms: f64,
    pub uncertainty_ms: f64,
}
/// Interpolate only inside observed continuous coverage. Never clamp an event
/// into footage that was not recorded; a stalled/reset clock is not invertible.
pub fn map_time(anchors: &[Anchor], game_seconds: f64) -> Option<MappedTime> {
    if !game_seconds.is_finite() {
        return None;
    }
    for pair in anchors.windows(2) {
        let [a, b] = [pair[0], pair[1]];
        if ![
            a.game_seconds,
            b.game_seconds,
            a.media_ms,
            b.media_ms,
            a.uncertainty_ms,
            b.uncertainty_ms,
        ]
        .iter()
        .all(|x| x.is_finite())
            || a.uncertainty_ms < 0.0
            || b.uncertainty_ms < 0.0
        {
            continue;
        }
        let dg = b.game_seconds - a.game_seconds;
        let dm = b.media_ms - a.media_ms;
        if dg <= 0.0 || dm <= 0.0 || !(0.95..=1.05).contains(&(dm / (dg * 1000.0))) {
            continue;
        }
        if game_seconds >= a.game_seconds && game_seconds <= b.game_seconds {
            let t = (game_seconds - a.game_seconds) / dg;
            return Some(MappedTime {
                media_ms: a.media_ms + t * dm,
                uncertainty_ms: a.uncertainty_ms.max(b.uncertainty_ms),
            });
        }
    }
    None
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Candidate {
    pub start_ms: f64,
    pub end_ms: f64,
    pub missing_context: bool,
    pub event_ids: BTreeSet<String>,
}
pub fn candidate(event_id: String, event_ms: f64, duration_ms: f64) -> Option<Candidate> {
    if !event_ms.is_finite() || !duration_ms.is_finite() || event_ms < 0.0 || event_ms > duration_ms
    {
        return None;
    }
    Some(Candidate {
        start_ms: (event_ms - 10000.0).max(0.0),
        end_ms: (event_ms + 8000.0).min(duration_ms),
        missing_context: event_ms < 10000.0 || event_ms + 8000.0 > duration_ms,
        event_ids: BTreeSet::from([event_id]),
    })
}
pub fn merge_candidates(mut values: Vec<Candidate>) -> Vec<Candidate> {
    values.sort_by(|a, b| a.start_ms.total_cmp(&b.start_ms));
    let mut out: Vec<Candidate> = vec![];
    for value in values {
        if let Some(last) = out.last_mut() {
            if value.start_ms <= last.end_ms {
                last.end_ms = last.end_ms.max(value.end_ms);
                last.missing_context |= value.missing_context;
                last.event_ids.extend(value.event_ids);
                continue;
            }
        }
        out.push(value);
    }
    out
}
#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    #[test]
    fn maps_offset_and_drift() {
        let a = [
            Anchor {
                game_seconds: 100.0,
                media_ms: 1000.0,
                uncertainty_ms: 100.0,
            },
            Anchor {
                game_seconds: 110.0,
                media_ms: 11020.0,
                uncertainty_ms: 150.0,
            },
        ];
        assert_eq!(map_time(&a, 105.0).unwrap().media_ms, 6010.0);
        assert!(map_time(&a, 99.0).is_none());
    }
    #[test]
    fn rejects_pause_reset_and_missing() {
        let a = Anchor {
            game_seconds: 5.0,
            media_ms: 0.0,
            uncertainty_ms: 10.0,
        };
        for game in [5.0, 4.0, 6.0] {
            let b = Anchor {
                game_seconds: game,
                media_ms: 10000.0,
                uncertainty_ms: 10.0,
            };
            assert!(map_time(&[a, b], 5.0).is_none());
        }
        assert!(map_time(&[], 10.0).is_none());
    }
    #[test]
    fn merges_evidence_and_marks_missing_preroll() {
        let c = merge_candidates(vec![
            candidate("a".into(), 5000.0, 60000.0).unwrap(),
            candidate("b".into(), 12000.0, 60000.0).unwrap(),
        ]);
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].event_ids.len(), 2);
        assert!(c[0].missing_context);
        assert_eq!(c[0].start_ms, 0.0);
    }
    proptest! {#[test]fn candidates_stay_in_coverage(t in 0.0f64..100000.0){let c=candidate("a".into(),t,100000.0).unwrap();prop_assert!(c.start_ms>=0.0 && c.end_ms<=100000.0 && c.start_ms<=t && c.end_ms>=t);}}
}
