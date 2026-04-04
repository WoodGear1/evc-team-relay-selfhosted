# @entire-vc/ui-svelte

> Svelte 5 UI components for EVC Brand Kit - visual parity with @entire-vc/ui

## Features

- **Svelte 5** with runes API ($props, $state, $derived)
- **Bits UI** primitives (Svelte equivalent of Radix UI)
- **CVA** for component variants (same API as React version)
- **Full visual parity** with @entire-vc/ui React components
- **TypeScript** support

## Installation

```bash
pnpm add @entire-vc/ui-svelte @entire-vc/tokens
```

## Setup

### 1. Configure Tailwind

```js
// tailwind.config.js
const evcPreset = require('@entire-vc/tokens/tailwind-preset');

export default {
  presets: [evcPreset],
  content: [
    './src/**/*.{html,js,svelte,ts}',
    './node_modules/@entire-vc/ui-svelte/dist/**/*.{js,svelte}',
  ],
  darkMode: 'class',
};
```

### 2. Import theme CSS

```css
/* app.css */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
@import '@entire-vc/tokens/css/entire.css'; /* or spark.css, playground.css, team-relay.css */

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
}

body {
  font-family: var(--font-sans);
}
```

### 3. Use components

```svelte
<script>
  import { Button, Card, CardHeader, CardTitle, CardContent } from '@entire-vc/ui-svelte';
</script>

<Card>
  <CardHeader>
    <CardTitle>Welcome</CardTitle>
  </CardHeader>
  <CardContent>
    <Button variant="default">Get Started</Button>
    <Button variant="secondary">Learn More</Button>
  </CardContent>
</Card>
```

## Components

### Basic
- Button, Input, Textarea, Label, Badge, Separator, Skeleton

### Feedback & Layout
- Alert, AlertTitle, AlertDescription
- Progress
- Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
- Avatar, AvatarImage, AvatarFallback
- AspectRatio
- ScrollArea, ScrollBar

### Overlays
- Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription
- Sheet, SheetTrigger, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription
- Popover, PopoverTrigger, PopoverContent
- Tooltip, TooltipTrigger, TooltipContent, TooltipProvider
- HoverCard, HoverCardTrigger, HoverCardContent
- AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogAction, AlertDialogCancel

### Navigation
- Tabs, TabsList, TabsTrigger, TabsContent
- Accordion, AccordionItem, AccordionTrigger, AccordionContent
- Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator
- Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext

### Forms
- Select, SelectTrigger, SelectValue, SelectContent, SelectItem
- Checkbox
- RadioGroup, RadioGroupItem
- Switch
- Toggle
- Slider

### Menus
- DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator
- ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator
- Collapsible, CollapsibleTrigger, CollapsibleContent

### Sidebar (Navigation with Tree support)
- SidebarProvider, Sidebar, SidebarTrigger, SidebarRail, SidebarInset
- SidebarHeader, SidebarFooter, SidebarContent, SidebarSeparator, SidebarInput
- SidebarGroup, SidebarGroupLabel, SidebarGroupAction, SidebarGroupContent
- SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction
- SidebarMenuBadge, SidebarMenuSkeleton
- SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton

### Icons
All [Lucide icons](https://lucide.dev/icons) are re-exported from `@entire-vc/ui-svelte`

## Button Variants

```svelte
<Button variant="default">Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Destructive</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon">Icon</Button>
```

## Sidebar Example

```svelte
<script>
  import {
    SidebarProvider,
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarMenuSub,
    SidebarMenuSubItem,
    SidebarMenuSubButton,
    SidebarInset,
    SidebarTrigger,
    // Icons
    Home,
    Folder,
    File,
    Settings,
    ChevronRight
  } from '@entire-vc/ui-svelte';
  import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@entire-vc/ui-svelte';

  const files = [
    {
      name: 'src',
      children: [
        { name: 'components', children: [{ name: 'Button.svelte' }, { name: 'Card.svelte' }] },
        { name: 'lib', children: [{ name: 'utils.ts' }] },
      ],
    },
    { name: 'package.json' },
    { name: 'README.md' },
  ];
</script>

<SidebarProvider>
  <Sidebar>
    <SidebarHeader>
      <h2 class="text-lg font-semibold px-4 py-2">My Project</h2>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Navigation</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <Home class="h-4 w-4" />
                <span>Home</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <Settings class="h-4 w-4" />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Files</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {#each files as item}
              {#if item.children}
                <Collapsible>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton>
                        <Folder class="h-4 w-4" />
                        <span>{item.name}</span>
                        <ChevronRight class="ml-auto h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {#each item.children as child}
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton>
                              {#if child.children}
                                <Folder class="h-4 w-4" />
                              {:else}
                                <File class="h-4 w-4" />
                              {/if}
                              <span>{child.name}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        {/each}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              {:else}
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <File class="h-4 w-4" />
                    <span>{item.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              {/if}
            {/each}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>

  <SidebarInset>
    <header class="flex items-center gap-2 p-4 border-b">
      <SidebarTrigger />
      <h1>Content Area</h1>
    </header>
    <main class="p-4">
      <!-- Your content here -->
    </main>
  </SidebarInset>
</SidebarProvider>
```

## Icons

```svelte
<script>
  import { Button, Search, Plus, Loader2, Heart } from '@entire-vc/ui-svelte';
</script>

<!-- With buttons -->
<Button>
  <Search class="mr-2 h-4 w-4" />
  Search
</Button>

<!-- Standalone -->
<Heart class="h-6 w-6 text-destructive" />

<!-- Animated spinner -->
<Loader2 class="h-6 w-6 animate-spin" />
```

Browse all icons at [lucide.dev/icons](https://lucide.dev/icons)

## Dark Mode

Add `dark` class to `<html>` element:

```svelte
<script>
  let isDark = $state(false);

  function toggleDark() {
    isDark = !isDark;
    document.documentElement.classList.toggle('dark', isDark);
  }
</script>

<Button onclick={toggleDark}>Toggle Dark Mode</Button>
```

## Development

```bash
# Build
pnpm --filter @entire-vc/ui-svelte build

# Type check
pnpm --filter @entire-vc/ui-svelte check
```

## License

MIT © [Entire VC](https://entire.vc)
