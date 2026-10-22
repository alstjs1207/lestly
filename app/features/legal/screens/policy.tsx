// Compile trusted policy documents at build time; never evaluate code in the browser.
import type { Route } from "./+types/policy";

import { Link, data } from "react-router";

import {
  TypographyBlockquote,
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyInlineCode,
  TypographyList,
  TypographyOrderedList,
  TypographyP,
} from "~/core/components/mdx-typography";
// Typography components for consistent MDX styling
import { Button } from "~/core/components/ui/button";

import PrivacyPolicy, {
  frontmatter as privacy,
} from "../docs/privacy-policy.mdx";
import TermsOfService, {
  frontmatter as terms,
} from "../docs/terms-of-service.mdx";

const policies = {
  "privacy-policy": { Component: PrivacyPolicy, frontmatter: privacy },
  "terms-of-service": { Component: TermsOfService, frontmatter: terms },
};

export const meta: Route.MetaFunction = ({ data }) => {
  // Handle case where the policy document doesn't exist (404)
  if (!data) {
    return [
      {
        title: `404 Page Not Found | ${import.meta.env.VITE_APP_NAME}`,
      },
    ];
  }

  // For valid policy documents, use frontmatter for metadata
  return [
    {
      title: `${data.frontmatter.title} | ${import.meta.env.VITE_APP_NAME}`,
    },
    {
      name: "description",
      content: data.frontmatter.description,
    },
  ];
};

export async function loader({ params }: Route.LoaderArgs) {
  if (!params.slug || !Object.hasOwn(policies, params.slug))
    throw data(null, { status: 404 });
  const slug = params.slug as keyof typeof policies;
  return { slug, frontmatter: policies[slug].frontmatter };
}

export default function Policy({ loaderData: { slug } }: Route.ComponentProps) {
  const MDXContent = policies[slug].Component;

  return (
    <div className="mx-auto w-full max-w-screen-xl space-y-10 px-5 py-10 md:px-10 md:py-20">
      {/* Navigation button to return to home page */}
      <Button variant="outline" asChild>
        <Link to="/" viewTransition>
          &larr; Go home
        </Link>
      </Button>

      {/* MDX content container */}
      <div>
        <MDXContent
          components={{
            // Map MDX elements to custom typography components
            // This ensures consistent styling across all legal documents
            h1: TypographyH1,
            h2: TypographyH2,
            h3: TypographyH3,
            h4: TypographyH4,
            p: TypographyP,
            blockquote: TypographyBlockquote,
            ul: TypographyList,
            ol: TypographyOrderedList,
            code: TypographyInlineCode,
          }}
        />
      </div>
    </div>
  );
}
