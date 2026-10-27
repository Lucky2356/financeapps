// Смена пароля — на устройстве И на службе.
//
// Пароль меняют здесь: переупаковывается ключ книги (lib/vault/account.ts). Но
// служба синхронизации хранит СВОЮ копию шкатулки и секрет входа — то, что ей
// прислали при регистрации, — и об этой смене не знала. Прежний пароль поэтому
// продолжал пускать на службу со свежего устройства и открывать там книгу, а
// человек, сменивший пароль из-за того, что его подсмотрели, не менял ничего.
//
// Отсюда порядок, и он один на оба пути (смена в настройках и сброс кодом на
// экране замка):
//
//   1. сменить у себя — как раньше, без сети;
//   2. ЗАПОМНИТЬ, что отправить службе (см. ServerAccount.queueVaultChange);
//   3. отправить; не вышло — запомненное уйдёт при следующем запуске или
//      сверке (runtime.ts зовёт push() на обоих).
//
// Отдельным классом, а не кодом в runtime.ts: там всё собрано из настоящего
// хранилища устройства, и проверить путь «без связи, потом со связью» можно
// было бы только живым приложением.

import type { AccountService } from "@/lib/vault/account";
import type { ServerAccount, VaultPush } from "@/lib/vault/server-account";
import { authSecret } from "@/lib/sync/vault-crypto";
import { apiText } from "@/lib/i18n/api-text";

export class PasswordSync {
  private pushing: Promise<VaultPush> | null = null;

  constructor(
    private readonly account: AccountService,
    private readonly server: ServerAccount,
    /**
     * Кому сказать об исходе каждой отправки — экран решает, что показать.
     * `quiet` — исход и так достанется тому, кто ждёт вызова (смена пароля в
     * настройках), и повторять его вторым сообщением незачем.
     */
    private readonly report: (outcome: VaultPush, quiet: boolean) => void = () => {}
  ) {}

  /**
   * Сменить пароль. Возвращает, что вышло со службой: «idle» — службы нет или
   * сообщать ей нечего.
   *
   * Прежний секрет входа выводится ДО смены: после неё прежней шкатулки уже
   * нет, а соль, из которой служба его знает, лежит именно в ней.
   */
  async changePassword(current: string, next: string): Promise<VaultPush> {
    const before = await this.account.vault();
    await this.account.changePassword(current, next);
    if (!before || !(await this.server.wantsVaultChange())) return { kind: "idle" };

    const after = await this.account.vault();
    if (!after) return { kind: "idle" };
    await this.server.queueVaultChange({
      vault: after,
      secret: await authSecret(after, next),
      currentSecret: await authSecret(before, current)
    });
    // Идущая отправка могла прочитать запомненное ещё до этой смены — тогда её
    // исход не про неё. Дожидаемся и отправляем заново.
    if (this.pushing) await this.pushing;
    return this.push({ quiet: true });
  }

  /**
   * Сбросить пароль кодом восстановления (экран замка).
   *
   * Отправка — НЕ здесь. Экран замка ждёт этот вызов, чтобы пустить человека к
   * данным, и ждать ещё и сеть ему незачем: отперев книгу, приложение поднимает
   * синхронизацию, а с ней уходит и запомненное (runtime.ts, resumeSync).
   */
  async resetPassword(code: string, next: string): Promise<void> {
    await this.account.resetPassword(code, next);
    try {
      if (!(await this.server.wantsVaultChange())) return;
      const after = await this.account.vault();
      if (!after) return;
      await this.server.queueVaultChange({ vault: after, secret: await authSecret(after, next) });
    } catch {
      // У себя пароль уже сменён и книга отперта — запоминание отправки не
      // повод оставить человека на экране сброса с «не получилось». Служба
      // узнает о смене при следующей смене пароля.
    }
  }

  /**
   * Отправить ждущую смену, если она есть. Одна отправка за раз: зовут отсюда
   * и при запуске, и после каждой сверки, и два одинаковых запроса подряд
   * второй раз упёрлись бы в «прежний секрет не подходит».
   */
  push(options: { quiet?: boolean } = {}): Promise<VaultPush> {
    if (this.pushing) return this.pushing;
    this.pushing = this.server
      .sendPendingVault()
      // Сюда доходят только поломки хранилища: сеть и отказы службы
      // sendPendingVault превращает в исход сам. Наружу не бросаем — зовут это
      // и фоном, где брошенное стало бы необработанным отказом.
      .catch(
        (cause: unknown): VaultPush => ({
          kind: "failed",
          message: (cause as Error)?.message || apiText("api.vault.passwordSendFailed")
        })
      )
      .then((outcome) => {
        this.report(outcome, options.quiet === true);
        return outcome;
      })
      .finally(() => {
        this.pushing = null;
      });
    return this.pushing;
  }
}
