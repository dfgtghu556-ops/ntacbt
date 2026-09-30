/**
 * Test-only router harness. Not a suite - vitest's include pattern only picks up
 * test and spec files, so this is imported as a plain module.
 *
 * Exports a single lowercase function, not a component. `ExamResult` and the
 * attempt screens are full of `<Link>`, and TanStack's `RouterProvider` renders its
 * own matched route rather than its children - so the child has to be registered
 * as a route, inside a real harness component. The harness stays unexported so
 * this file does not mix component and non-component exports, which
 * `react-refresh/only-export-components` flags and the gate runs eslint with
 * `--max-warnings=0`.
 */

import type { ReactElement } from "react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";

/**
 * Render `children` inside a real router, so `<Link>` and `useParams` work, and
 * wait for it to settle.
 *
 * The router renders asynchronously, which is why every assertion against this
 * harness must be wrapped in `waitFor` - a synchronous `render()` sees an empty
 * container and the assertion fails with "unable to find", which reads like a
 * broken component rather than a harness that has not finished.
 *
 * jsdom logs a harmless "Not implemented: window.scrollTo" when the router
 * settles; it is noise, not a failure.
 */
export async function renderInRouter(ui: ReactElement) {
  const Harness = () => {
    const root = createRootRoute();
    const test = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => <>{ui}</>,
    });
    const router = createRouter({
      routeTree: root.addChildren([test]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    return <RouterProvider router={router} />;
  };
  const utils = render(<Harness />);
  await waitFor(() => {
    if (!utils.container.textContent) throw new Error("router has not rendered");
  });
  return utils;
}
