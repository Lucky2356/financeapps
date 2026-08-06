import type { Metadata } from "next";

import { CategoryManager } from "@/components/categories/category-manager";
import { RulesManager } from "@/components/rules/rules-manager";
import { PageHeader } from "@/components/page-header";
import { getCategoriesPageData } from "@/lib/data";
import { ensureFreshServerData } from "@/lib/rendering";

export const metadata: Metadata = {
  title: "Категории"
};

export default async function CategoriesPage() {
  await ensureFreshServerData();
  const data = await getCategoriesPageData();

  return (
    <div className="page-grid">
      <div className="hidden md:block">
        <PageHeader titleKey="page.categories.title" descriptionKey="page.categories.desc" />
      </div>
      <CategoryManager data={data} />
      <RulesManager />
    </div>
  );
}
