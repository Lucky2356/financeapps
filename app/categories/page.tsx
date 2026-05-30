import type { Metadata } from "next";

import { CategoryManager } from "@/components/categories/category-manager";
import { PageHeader } from "@/components/page-header";
import { SourceBanner } from "@/components/source-banner";
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
      <PageHeader
        title="Категории"
        description="Настройте категории доходов и расходов для точной классификации операций."
      />
      <SourceBanner source={data.source} />
      <CategoryManager data={data} />
    </div>
  );
}
