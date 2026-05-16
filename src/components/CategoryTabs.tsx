/**
 * CategoryTabs — Horizontal tab bar for campaign categories.
 *
 * Loads categories from `useCampaignCategories` hook, persists the last
 * selected tab in the Zustand store (activeCategory), and shows a campaign
 * count badge per tab.
 *
 * Requirements: 1.2, 10.1, 10.2, 10.4, 10.5
 */

import { useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaignCategories } from '@/hooks/useCampaignCategories';
import { useCommercialBranches } from '@/hooks/useCommercialBranches';
import { useDesignStore } from '@/store/designStore';
import type { CampaignCategory } from '@/types/xendingDesign';

interface CategoryTabsProps {
  /** Called when the active category changes */
  onCategoryChange?: (category: CampaignCategory) => void;
}

export function CategoryTabs({ onCategoryChange }: CategoryTabsProps) {
  const { data: categories, isLoading, isError } = useCampaignCategories();
  const activeCategory = useDesignStore((s) => s.activeCategory);
  const setActiveCategory = useDesignStore((s) => s.setActiveCategory);

  // Auto-select the first category when categories load and none is selected
  useEffect(() => {
    if (categories && categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0]);
      onCategoryChange?.(categories[0]);
    }
  }, [categories, activeCategory, setActiveCategory, onCategoryChange]);

  const handleTabChange = (value: string) => {
    const category = categories?.find((c) => c.id === value);
    if (category) {
      setActiveCategory(category);
      onCategoryChange?.(category);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-32 rounded-md" />
        ))}
      </div>
    );
  }

  if (isError || !categories || categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay categorías configuradas para este negocio.
      </p>
    );
  }

  return (
    <Tabs
      value={activeCategory?.id ?? categories[0]?.id}
      onValueChange={handleTabChange}
      className="w-full"
    >
      <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
        {categories.map((category) => (
          <CategoryTab key={category.id} category={category} />
        ))}
      </TabsList>
    </Tabs>
  );
}

/** Individual category tab with a count badge */
function CategoryTab({ category }: { category: CampaignCategory }) {
  const { data: branches } = useCommercialBranches(category.id ?? null);
  const count = branches?.length ?? 0;

  return (
    <TabsTrigger
      value={category.id!}
      className="flex items-center gap-2 px-4 py-2 text-sm"
    >
      <span>{category.name}</span>
      {count > 0 && (
        <Badge
          variant="secondary"
          className="h-5 min-w-[20px] px-1.5 text-[10px] leading-none"
        >
          {count}
        </Badge>
      )}
    </TabsTrigger>
  );
}
