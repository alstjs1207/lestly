declare module "*.mdx" {
  import type { ComponentType } from "react";
  export const frontmatter: { title: string; description: string };
  const Component: ComponentType<{
    components?: Record<string, ComponentType<any>>;
  }>;
  export default Component;
}
