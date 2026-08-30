import { serveChannels } from '@gesso/framework';
import { AppearanceApp } from '../ThemeExampleApp';
import { AppearanceChannel } from './ThemeContract';

/** The appearance application, on its own thread. */
const appearance = new AppearanceApp();

serveChannels([
  {
    token: AppearanceChannel,
    source: {
      view: { view: appearance.view },
      commands: {
        setPalette: (palette: string) => appearance.setPalette(palette as never),
        setAccent: (accent: string) => appearance.setAccent(accent as never),
        setCorners: (corners: string) => appearance.setCorners(corners as never),
        setTextSize: (textSize: string) => appearance.setTextSize(textSize as never)
      }
    }
  }
]);
