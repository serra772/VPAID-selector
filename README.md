# VPAID 2.0 Video Selector

This project is a VPAID 2.0 ad unit (JavaScript) that allows the user to select one of two videos to watch. The unit supports a background image, interactive selection with hover effects, auto-start, and event tracking.

## Project Structure

*   **`vpaid.js`**: The main logic file for the VPAID unit. Contains the `SelectorVPAID` class which implements the VPAID 2.0 interface.
*   **`vast.xml`**: An example VAST 3.0 XML file used to deliver the VPAID unit and pass configuration (AdParameters).
*   **`test.html`**: An HTML page for local testing and debugging of the unit without using an external video player.
*   **`background.png`**: The background image displayed on the selection screen.
*   **`video1.mp4` / `video2.mp4`**: The video files offered to the user for selection.

## Functionality

1.  **Selection Screen**: Displays two panels with video previews (or selection areas) against `background.png`.
2.  **Interactivity**: Hovering over a selection option highlights the frame and darkens the rest of the area (including the container's red border).
3.  **Auto-start**: If the user does not make a selection within a specified time (default is 10 seconds), the first video starts automatically.
4.  **Tracking**: Supports standard VPAID events (AdImpression, AdVideoStart, AdVideoComplete, AdClickThru, etc.) and custom pixels.

## Configuration (AdParameters)

Configuration is passed via the `<AdParameters>` section in the `vast.xml` file in JSON format.

Example configuration:

```json
{
  "staticImageUrl": "background.png",
  "autoStartTimeoutMs": 10000,
  "videoOptions": [
    {
      "id": "video1",
      "videoUrl": "video1.mp4",
      "clickThroughUrl": "https://example.com/click1"
    },
    {
      "id": "video2",
      "videoUrl": "video2.mp4",
      "clickThroughUrl": "https://example.com/click2"
    }
  ],
  "customPixelBaseUrl": "https://track.example.com/pixel",
  "customPixelCommonParams": "&campaign_id=123"
}
```

### Parameters:

*   `staticImageUrl`: URL of the background image.
*   `autoStartTimeoutMs`: Time in milliseconds before the first video auto-starts (if 0 or omitted, auto-start is disabled).
*   `videoOptions`: Array of video objects. Each object must contain:
    *   `id`: Unique identifier.
    *   `videoUrl`: URL of the video file (.mp4).
    *   `clickThroughUrl`: URL to navigate to upon click (AdClickThru).
*   `customPixelBaseUrl` (optional): Base URL for custom tracking pixels.

## Local Testing

To check the unit's operation, use the `test.html` file.

1.  Ensure all files (`vpaid.js`, `test.html`, videos, and images) are in the same folder.
2.  Open `test.html` in a modern browser.
3.  The page emulates a video player: it loads `vpaid.js`, initializes it, and passes parameters.
4.  You can see event logs (AdLoaded, AdStarted, etc.) in the browser console.

**Important**: Due to browser security policies (CORS), running a local web server (e.g., via the "Live Server" extension in VS Code or `python3 -m http.server`) may be required for video and script loading to work correctly.

## Deployment

1.  Upload `vpaid.js`, images, and video files to your hosting or CDN.
2.  Update the `vast.xml` file:
    *   In the `<MediaFile>` tag, specify the absolute URL to the uploaded `vpaid.js`.
    *   In `<AdParameters>`, update the paths for `staticImageUrl` and `videoUrl` to absolute URLs.
    *   **Tracking**: Replace all `[PLACEHOLDER_...]` values in `vast.xml` with your actual tracking URLs.
3.  Use the link to the updated `vast.xml` in your ad network or player.
