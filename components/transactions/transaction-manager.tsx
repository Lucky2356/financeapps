"use client";

import { ReceiptText } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { ReceiptPhotoDialog } from "@/components/transactions/receipt-photo-dialog";
import { useAiSettings } from "@/hooks/use-ai-settings";
import { useI18n } from "@/lib/i18n/context";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { TransactionsPageData } from "@/lib/data";
import { useConfirmFutureDate } from "@/hooks/use-confirm-future-date";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";

import { BulkActionsBar } from "@/components/transactions/transaction-manager/bulk-bar";
import { makeRowAmount } from "@/components/transactions/transaction-manager/helpers";
import { TransactionListHeader } from "@/components/transactions/transaction-manager/list-header";
import { TransactionPagination } from "@/components/transactions/transaction-manager/pagination";
import { TransactionCards } from "@/components/transactions/transaction-manager/transaction-cards";
import { TransactionDialog } from "@/components/transactions/transaction-manager/transaction-dialog";
import { TransactionTable } from "@/components/transactions/transaction-manager/transaction-table";
import { useBulkActions } from "@/components/transactions/transaction-manager/use-bulk-actions";
import { useTransactionListView } from "@/components/transactions/transaction-manager/use-list-view";
import { useTransactionRowActions } from "@/components/transactions/transaction-manager/use-row-actions";
import { useTransactionSelection } from "@/components/transactions/transaction-manager/use-selection";
import { useTransactionsData } from "@/components/transactions/transaction-manager/use-transactions-data";

// Части экрана лежат в ./transaction-manager/: здесь только сборка.
// Порядок хуков важен: эффекты загрузки списка идут раньше сброса выделения.
export function TransactionManager({ data }: { data: TransactionsPageData }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const aiSettings = useAiSettings();
  const searchParams = useSearchParams();
  const paramsString = searchParams.toString();
  const { run, pending: isMutating } = useApiMutation();
  const confirm = useConfirm();
  const confirmFutureDate = useConfirmFutureDate();
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const { pageData, loadTransactions } = useTransactionsData(data, paramsString);
  const { visibleTransactions, sort, sortLabel, changeSort, dayStarts, totals, net } =
    useTransactionListView({ pageData, searchParams, paramsString, router, t });
  const { selectedIds, allVisibleSelected, toggleSelect, toggleSelectAll, clearSelection } =
    useTransactionSelection(visibleTransactions, paramsString);
  const rowAmount = makeRowAmount(data.accounts);

  async function refresh() {
    await loadTransactions(true);
    router.refresh();
  }

  const { editingTransaction, setEditingTransaction, submitTransaction, removeTransaction } =
    useTransactionRowActions({
      pageData,
      run,
      confirm,
      confirmFutureDate,
      t,
      rowAmount,
      refresh
    });
  const bulk = useBulkActions({
    pageData,
    visibleTransactions,
    selectedIds,
    clearSelection,
    confirm,
    aiSettings,
    t,
    locale,
    refresh
  });

  return (
    <div className="space-y-4">
      {/* The filters belong to the list they filter. They used to sit on the
          page between two cards, a strip of controls attached to nothing;
          inside the card they read as its own controls. */}
      <Card>
        <TransactionListHeader
          pageData={pageData}
          visibleCount={visibleTransactions.length}
          totals={totals}
          net={net}
          sort={sort}
          sortLabel={sortLabel}
          onSortChange={changeSort}
        />
        <CardContent>
          {visibleTransactions.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title={t("tx.empty.title")}
              description={t("tx.empty.desc")}
            />
          ) : (
            <>
              {selectedIds.size > 0 ? (
                <BulkActionsBar
                  selectedCount={selectedIds.size}
                  categories={pageData.categories}
                  bulkCategory={bulk.bulkCategory}
                  onBulkCategoryChange={bulk.setBulkCategory}
                  bulkPending={bulk.bulkPending}
                  aiEnabled={aiSettings?.aiEnabled}
                  onCategorize={bulk.bulkCategorize}
                  onApplyRules={bulk.bulkApplyRules}
                  onAiCategorize={bulk.bulkAiCategorize}
                  onDelete={bulk.bulkDelete}
                  onClear={clearSelection}
                />
              ) : null}
              <TransactionTable
                transactions={visibleTransactions}
                selectedIds={selectedIds}
                allVisibleSelected={allVisibleSelected}
                onToggleSelectAll={toggleSelectAll}
                onToggleSelect={toggleSelect}
                rowAmount={rowAmount}
                isMutating={isMutating}
                onPhoto={setPhotoFor}
                onEdit={setEditingTransaction}
                onRemove={removeTransaction}
              />

              <TransactionCards
                transactions={visibleTransactions}
                dayStarts={dayStarts}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                rowAmount={rowAmount}
                isMutating={isMutating}
                onPhoto={setPhotoFor}
                onEdit={setEditingTransaction}
                onRemove={removeTransaction}
              />
              <TransactionPagination data={pageData} searchParams={searchParams} />
            </>
          )}
        </CardContent>
      </Card>

      <ReceiptPhotoDialog
        transactionId={photoFor}
        onClose={() => setPhotoFor(null)}
        onChanged={() => void refresh()}
      />

      {/* Single controlled dialog for editing any transaction */}
      <Dialog
        open={editingTransaction !== null}
        onOpenChange={(open) => {
          if (!open) setEditingTransaction(null);
        }}
      >
        {editingTransaction && (
          <TransactionDialog
            title={t("tx.edit")}
            description={t("tx.edit.desc")}
            data={pageData}
            transaction={editingTransaction}
            pending={isMutating}
            onSubmit={submitTransaction}
            onRefsReload={() => loadTransactions(true)}
          />
        )}
      </Dialog>
    </div>
  );
}
