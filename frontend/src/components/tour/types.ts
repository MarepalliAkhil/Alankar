import type { MeeraPose } from './meera-data';

export interface TourStep {
  id: string;
  /**
   * Values of `data-tour` attributes on real controls. The spotlight covers every one that is on
   * screen; if none is, the step is skipped, so a missing control never blocks the tour.
   */
  targets: string[];
  /** On phones the controls live in the menu drawer: open it for this step. */
  menu?: boolean;
  /** Short chapter name (also the dialog's accessible name). */
  title: string;
  /** What Meera says: about 12 to 18 words. `{name}` becomes the person's first name. */
  speech: string;
  pose: MeeraPose;
  /** The pose to use instead when the person restarts the tour from the menu. */
  restartPose?: MeeraPose;
}

export interface TourFinale {
  title: string;
  speech: string;
  pose: MeeraPose;
  action: { label: string; to: string };
}

export interface TourDefinition {
  /** Stored as `tour:<id>` on the server. */
  id: string;
  steps: TourStep[];
  /** Shown after the last step: a celebration with one button. */
  finale?: TourFinale;
}
