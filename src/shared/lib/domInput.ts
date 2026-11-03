/**
 * 리액트가 들고 있는 input/textarea/select 의 값을, 리액트 state 를 직접 못 건드리는
 * 바깥(음성 입력처럼 DOM id 로만 그 칸을 아는 코드)에서 바꿔야 할 때 쓴다.
 *
 * el.value = x 만 하면 리액트 쪽 state 는 안 바뀐다(리액트가 value prop 으로 다시
 * 덮어써서 입력한 게 그대로 사라져 보인다) — 네이티브 setter 로 값을 넣은 뒤
 * input 이벤트를 쏴야 리액트의 onChange 가 진짜 사용자 입력처럼 반응한다.
 */
export function setNativeInputValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
