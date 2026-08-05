// Interface density preference — persisted in settings (see app-settings-sync)
// and reflected as data-density on <html>.
//
// The accent picker that used to live here is gone: Nocturne defines ONE accent
// (the blurple #9184d9), and it is load-bearing — charts, positive amounts,
// selected tabs and the FAB all key off it, and a swappable hue would have to
// re-derive that whole set per choice. The colour now lives only in
// app/globals.css.

export const DENSITY_FOUC_SCRIPT = `(function(){try{var d=localStorage.getItem("ui-density");if(d==="compact")document.documentElement.setAttribute("data-density","compact");}catch(e){}})();`;
