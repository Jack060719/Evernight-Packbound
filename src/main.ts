import './ui/release/release.css';
import { bootRelease } from './release-app';

const root = document.querySelector<HTMLElement>('#app')!;
void bootRelease(root).catch(error => {
  root.replaceChildren();
  const message = document.createElement('p');
  message.className = 'r-recovery';
  message.textContent = `無法開啟遊戲：${error instanceof Error ? error.message : '本機儲存不可用'}。原有存檔不會被清除，請重新載入。`;
  root.append(message);
});
