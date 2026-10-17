# P10-A hook requests

One optional line, outside P10-A's files.

## `LegendRising/js/ui/main.js:1265` (the drink from your stock at the hub or at half time), for FD-6

The toast rounds the energy to a whole number (`fmtSigned(r.gain)`), while `consume()` now returns it to one decimal, as
the fridge tooltip and the eat chip show it. For the same number everywhere:

```js
    save(); renderHub(); toast(`${r.item.name} · Energy ${fmtSigned(r.gain, Number.isInteger(r.gain) ? 0 : 1)}`);
```

Drinks give whole numbers at the hub today (no fridge quality applies), so nothing visible changes until a food with a part
point is drunk there. It's not required for P10-A's acceptance.
