// Which theme wins when two writers disagree.
//
// The app keeps the theme in two places: next-themes owns what is on screen
// (localStorage), and the device settings own what survives a reinstall
// (IndexedDB). On start, AppSettingsSync copies the stored value into
// next-themes — and that read is asynchronous, so it used to land AFTER a user
// who opened Settings and picked a theme in the first seconds, silently
// reverting the choice they just made. This flag lets the sync step know a
// human has already spoken this session.

let chosen = false;

/** Call right before setTheme() on any control the user operated. */
export function markThemeChosen() {
  chosen = true;
}

/** True once the user picked a theme in this session. */
export function themeChosenThisSession() {
  return chosen;
}
