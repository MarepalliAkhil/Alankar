import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders, AppRoutes, routerFuture } from '../App';

/** Renders the real routes at a given URL with all app providers. */
export function renderAt(path: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]} future={routerFuture}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}
