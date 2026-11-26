# Using The Plot Tickens on iPhone and iPad

## Install

1. Open the site in **Safari**. (On iOS 16.4 and later, Chrome and Edge can also add to the Home Screen through their Share menu.)
2. Tap **Share** (the square with an upward arrow).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Launch it from the Home Screen icon. It opens full-screen with no browser bars, and after the first launch it works without a connection.

On the first visit the app downloads its whole quotation library (a few megabytes) in the background. Leave it open for a minute on Wi-Fi so the offline copy is complete. **Settings → The library** shows the current edition.

## As a desk or bedside clock

* **Keep screen awake** (Settings → Always-on display) uses the Screen Wake Lock API, which Safari supports from iOS 16.4. Releases before iOS 18.4 did not honour it for Home Screen web apps. If the switch reports that the screen may sleep, set **Settings → Display & Brightness → Auto-Lock → Never** while the phone is on its charger.
* **Bedside** display mode enlarges the time and dims the screen. **Night mode** can go below the system's minimum brightness, either always or on a schedule.
* **Burn-in protection** moves the text slightly every few minutes, which is worth turning on for OLED iPhones left on all night.
* Turn the phone sideways for the landscape layout. The text re-fits itself automatically.
* Turn on **Guided Access** (Settings → Accessibility) if you want to lock the phone to the clock.

## What a web app cannot do on iOS

* It cannot keep running after you switch apps or lock the phone. When you come back, the clock resynchronises to the correct minute instantly.
* It cannot override Auto-Lock or the Lock Screen except through the Wake Lock API above.
* It cannot provide Home Screen or Lock Screen widgets, StandBy views or Live Activities.

## Privacy

Favourites, history and preferences stay on the device, in IndexedDB and localStorage. Nothing is uploaded and there is no analytics. Deleting the Home Screen app removes its data.
