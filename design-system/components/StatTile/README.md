# StatTile

A single admin metric: label, value, and a change with an arrow and words.

The consumer provides `label`, a pre-formatted `value`, and optionally `delta` ("8% vs last week"), `trend` (up/down arrow) and `deltaTone` (`good` → `vault`, `bad` → `danger`). Whether "up" is good depends on the metric — open disputes going up is `bad`. Four tiles to a row at most.
