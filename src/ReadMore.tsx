// Links from the app into the strategy guide.

import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";
import { Anchor, type AnchorProps } from "@mantine/core";
import { createLink, type LinkComponent } from "@tanstack/react-router";
import type { GuideSection } from "@clock-manager/schemas";
import type { Reason } from "./sim";

interface MantineAnchorProps extends AnchorProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof AnchorProps> {}

const MantineAnchor = forwardRef<HTMLAnchorElement, MantineAnchorProps>((props, ref) => <Anchor ref={ref} {...props} />);
MantineAnchor.displayName = "MantineAnchor";

const CreatedAnchorLink = createLink(MantineAnchor);

/** A Mantine anchor that's a router link: `to` and `search` are checked against the route tree. */
export const AnchorLink: LinkComponent<typeof MantineAnchor> = (props) => <CreatedAnchorLink preload="intent" {...props} />;

/** A link to one section of the strategy guide. */
export function GuideLink({ section, children }: { section: GuideSection; children: ReactNode }) {
  return (
    // The guide scrolls to the section itself, so the router mustn't reset the scroll to the top afterward.
    <AnchorLink to="/guide" search={{ section }} resetScroll={false} className="read-more">
      {children}
    </AnchorLink>
  );
}

/** An explanation, followed by a "Read more" link to the guide section behind it. */
export function ReasonText({ reason }: { reason: Reason }) {
  return (
    <>
      {reason.text} <GuideLink section={reason.section}>Read more</GuideLink>
    </>
  );
}
