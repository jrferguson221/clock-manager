import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { RouterProvider } from "@tanstack/react-router";
import { cssVariablesResolver, theme } from "./theme";
import type { createAppRouter } from "./router";

/** Mantine with the Sideline theme, following the OS color scheme until you pick one with the toggle. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="auto">
      {children}
    </MantineProvider>
  );
}

export default function App({ router }: { router: ReturnType<typeof createAppRouter> }) {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}
