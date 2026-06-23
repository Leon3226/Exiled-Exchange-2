<template>
  <div
    style="top: 0; left: 0; height: 100%; width: 100%; position: absolute; background-color: rgba(0, 50, 0, 0)"
    class="flex grow h-full pointer-events-none"
  >
    <div style="font-size: 50px;">{{ pricing.lastPrice }}</div>
    <div
      v-for="([id, icon]) in iconEntries"
      :key="id"
      :style="{
        position: 'absolute',
        left: icon.x + 'px',
        top: icon.y + 'px',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'auto',
        animationDelay: (icon.animateDelay ?? 0) + 'ms'
      }"
      class="floating-icon"
    >
      <instant-check-icon :icon="icon.iconData" :detailed="icon.forceDetailed || icon.iconData.subjectiveScore > 4"></instant-check-icon>
    </div>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  inject,
  PropType,
  shallowRef,
  watch,
  computed,
  nextTick,
  provide,
  ref,
  reactive,
} from "vue";
import { Result, ok, err } from "neverthrow";
import { useI18n } from "vue-i18n";
import UiErrorBox from "@/web/ui/UiErrorBox.vue";
import UiPopover from "@/web/ui/Popover.vue";
import CheckedItem from "./CheckedItem.vue";
import BackgroundInfo from "./BackgroundInfo.vue";
import { MainProcess, Host } from "@/web/background/IPC";
import { usePoeninja } from "../background/Prices";
import { useLeagues } from "@/web/background/Leagues";
import { AppConfig } from "@/web/Config";
import { ItemCategory, ItemRarity, parseClipboard, ParsedItem } from "@/parser";
import RelatedItems from "./related-items/RelatedItems.vue";
import RateLimiterState from "./trade/RateLimiterState.vue";
import UnidentifiedResolver from "./unidentified-resolver/UnidentifiedResolver.vue";
import CheckPositionCircle from "./CheckPositionCircle.vue";
import AppTitleBar from "@/web/ui/AppTitlebar.vue";
import ItemQuickPrice from "@/web/ui/ItemQuickPrice.vue";
import {
  PriceCheckInstantWidget,
  WidgetManager,
  WidgetSpec,
} from "../overlay/interfaces";
import ItemEditor from "./filters/ItemEditor.vue";
import {
  BaseType,
  loadUltraLateItems,
} from "@/assets/data";
import { translatedEffectsPseudos } from "./filters/pseudo";
import { ItemEditorType } from "@/parser/meta";
import { getItemEditorType } from "./filters/util";
import { transformItemIntoVector } from "@/analyzer/item-processor";
import { getPrice } from "@/analyzer/analyzer";
import { getIcon } from "@/analyzer/display/icon-data-generator";
import { IconModel } from "@/analyzer/display/icon-model";
import InstantCheckIcon from "./InstantCheckIcon.vue";

type ParseError = {
  name: string;
  message: string;
  rawText: ParsedItem["rawText"];
};

export default defineComponent({
  widget: {
    type: "price-check-instant",
    instances: "single",
    initInstance: (): PriceCheckInstantWidget => {
      return {
        wmId: 0,
        wmType: "price-check-instant",
        wmTitle: "",
        wmWants: "hide",
        wmZorder: "exclusive",
        wmFlags: ["hide-on-blur", "menu::skip"],
        hotkeyInstant: "Ctrl + Alt + S",
        hotkeyInstantLocked: "Ctrl + Alt + A",
      };
    },
  } satisfies WidgetSpec,
  components: {
    AppTitleBar,
    CheckedItem,
    UnidentifiedResolver,
    BackgroundInfo,
    RelatedItems,
    ItemEditor,
    RateLimiterState,
    CheckPositionCircle,
    InstantCheckIcon,
    ItemQuickPrice,
    UiErrorBox,
    UiPopover,
  },
  props: {
    config: {
      type: Object as PropType<PriceCheckInstantWidget>,
      required: true,
    },
  },
  setup(props) {
    const wm = inject<WidgetManager>("wm")!;
    const {
      xchgRate,
      initialLoading: xchgRateLoading,
    } = usePoeninja();

    nextTick(() => {
      props.config.wmWants = "hide";
      props.config.wmFlags = ["hide-on-blur", "menu::skip"];
    });

    const item = shallowRef<null | Result<ParsedItem, ParseError>>(null);
    const rebuildKey = shallowRef(2);
    const advancedCheck = shallowRef(false);
    const checkPosition = shallowRef({ x: 1, y: 1 });
    const itemEditorOptions = ref<
      { editing: boolean; value: string; disabled: boolean } | undefined
    >({
      editing: false,
      value: "None",
      disabled: true,
    });

    const doubleClickThreshold = 200;
    let lastClickedTime: Date = new Date()
    let lastClickedItemHash: string = "";

    MainProcess.onEvent("MAIN->CLIENT::item-text", (e) => {
      if (e.target !== "price-check-instant") return;

      const scrX: number = e.position.x;
      const scrY: number = e.position.y;
      const newClickedTime: Date = new Date()
      const clickDelay = (newClickedTime.getTime() - lastClickedTime.getTime());
      const isDoubleClickDelay = clickDelay < doubleClickThreshold;
      lastClickedTime = newClickedTime;

      closeBrowser();
      wm.show(props.config.wmId);
      checkPosition.value = e.position;
      advancedCheck.value = e.focusOverlay;

      getItemPriceFromText(e.clipboard, e.item).then((p) => {
        const isDoubleClick = isDoubleClickDelay && lastClickedItemHash === p.itemHash;
        lastClickedItemHash = p.itemHash;
        if (isDoubleClick) {
          const prevId = lastPricingId - 1;
          const pricingIcon = itemPricingIcons.get(prevId);
          if (pricingIcon) {
            pricingIcon.forceDetailed = true;
          }
        }
        else{
          pricing.lastPrice = p.price; 
          const icon = getIcon(p.price);
          itemPricingIcons.set(lastPricingId, reactive({ x: scrX, y: scrY, iconData: icon, forceDetailed: false, animateDelay: 500 }));
          setToDeleteIcon(lastPricingId, 4000);
          const sound = new Audio(`/sounds/${icon.subjectiveScore}.wav`); // Questionable in terms of performance. Review if causes trouble.
          sound.volume = 0.45;
          sound.currentTime = 0;
          sound.play()
          lastPricingId++;
        }
      });

    });

    function setToDeleteIcon(iconId: number, delayMs: number){
      setTimeout(() => {
        itemPricingIcons.delete(iconId);
      }, delayMs);
    }

    let lastPricingId = 0;
    const pricing = reactive({ lastPrice: 0 });
    const itemPricingIcons = reactive(new Map<number, {x: number, y: number, iconData: IconModel, forceDetailed: boolean, animateDelay: number}>());
    const iconEntries = computed(() => Array.from(itemPricingIcons.entries()));
    const itemPrices = new Map<string, number>();
    const cacheEnabled = false;  

    async function getItemPriceFromText(itemText: string, eventItem: any): Promise<{price: number, itemHash: string}> {
      const itemHash: string = await getItemHashValue(itemText);
      if (cacheEnabled && itemPrices.has(itemHash)) {
        return { itemHash, price: itemPrices.get(itemHash) ?? 0 };
      } 
      item.value = handleItemPaste({ clipboard: itemText, item: eventItem });
      if (item.value.isOk()) {
        const realPrice = await getPrice(item.value.value);
        // const estimatedPrice = realPrice ?? getFakePrice();
        const estimatedPrice = realPrice ?? 0;
        itemPrices.set(itemHash, estimatedPrice);
        return { itemHash, price: estimatedPrice };
      }
      return {itemHash: "", price: 0};
    }

    function getFakePrice(): number {
      return Math.min(...Array.from({ length: 150 }, () => getRandomInt(10000)));
    }

    function getRandomInt(max: number): number {
      return Math.floor(Math.random() * max);
    }

    async function getItemHashValue(s: string): Promise<string> {
      const data = new TextEncoder().encode(s);
      const buf = await crypto.subtle.digest("SHA-256", data);
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
    }

    function handleItemPaste(e: { clipboard: string; item: any }) {
      const newItem = (
        e.item ? ok(e.item as ParsedItem) : parseClipboard(e.clipboard)
      )
        .andThen((item) =>
          (item.category === ItemCategory.HeistContract &&
            item.rarity !== ItemRarity.Unique) ||
          (item.category === ItemCategory.Sentinel &&
            item.rarity !== ItemRarity.Unique)
            ? err("item.unknown")
            : ok(item),
        )
        .mapErr((err) => ({
          name: `${err}`,
          message: `${err}_help`,
          rawText: e.clipboard,
        }));
      return newItem;
    }

    function handleIdentification(identified: ParsedItem) {
      item.value = ok(identified);
    }

    MainProcess.onEvent("MAIN->OVERLAY::hide-exclusive-widget", () => {
      wm.hide(props.config.wmId);
    });

    watch(
      () => props.config.wmWants,
      (state) => {
        if (state === "hide") {
          closeBrowser();
        }
      },
    );

    const leagues = useLeagues();
    const title = computed(
      () => leagues.selectedId.value || "Exiled Exchange 2",
    );
    const stableOrbCost = computed(() =>
      xchgRate.value ? Math.round(xchgRate.value) : null,
    );
    const isBrowserShown = computed(() =>
      props.config.wmFlags.includes("has-browser"),
    );
    const overlayKey = computed(() => AppConfig().overlayKey);
    const showCheckPos = computed(
      () => wm.active.value,
    );
    const isLeagueSelected = computed(() => Boolean(leagues.selectedId.value));
    const clickPosition = computed(() => {
      if (isBrowserShown.value) {
        return "inventory";
      } else {
        return checkPosition.value.x > window.screenX + window.innerWidth / 2
          ? "inventory"
          : "stash";
        // or {chat, vendor, center of screen}
      }
    });

    watch(isBrowserShown, (isShown) => {
      if (isShown) {
        wm.setFlag(props.config.wmId, "hide-on-blur", false);
        wm.setFlag(props.config.wmId, "invisible-on-blur", true);
      } else {
        wm.setFlag(props.config.wmId, "invisible-on-blur", false);
        wm.setFlag(props.config.wmId, "hide-on-blur", true);
      }
    });

    function closePriceCheck() {
      if (AppConfig().overlayAlwaysClose) {
        Host.sendEvent({
          name: "OVERLAY->MAIN::focus-game",
          payload: undefined,
        });
      } else if (isBrowserShown.value || !Host.isElectron) {
        wm.hide(props.config.wmId);
      } else {
        Host.sendEvent({
          name: "OVERLAY->MAIN::focus-game",
          payload: undefined,
        });
      }
    }

    function openLeagueSelection() {
      const settings = wm.widgets.value.find((w) => w.wmType === "settings")!;
      wm.setFlag(settings.wmId, `settings::widget=${props.config.wmId}`, true);
      wm.show(settings.wmId);
    }

    const iframeEl = shallowRef<HTMLIFrameElement | null>(null);

    function showBrowser(url: string) {
      wm.setFlag(props.config.wmId, "has-browser", true);
      nextTick(() => {
        iframeEl.value!.src = url;
      });
    }

    function closeBrowser() {
      wm.setFlag(props.config.wmId, "has-browser", false);
    }

    provide<(url: string) => void>("builtin-browser", showBrowser);

    const { t } = useI18n();

    return {
      t,
      clickPosition,
      isBrowserShown,
      iframeEl,
      closePriceCheck,
      title,
      stableOrbCost,
      xchgRateLoading,
      showCheckPos,
      checkPosition,
      item,
      advancedCheck,
      handleIdentification,
      overlayKey,
      isLeagueSelected,
      openLeagueSelection,
      rebuildKey,
      pricing,
      itemPricingIcons,
      iconEntries,
      itemEditorAvailable: computed(() => {
        if (!item.value?.isOk()) return false;
        return getItemEditorType(item.value.value) !== ItemEditorType.None;
      }),
      handleItemEditorSelection: (
        val:
          | {
              editing: boolean;
              value: string;
              disabled: boolean;
            }
          | undefined,
      ) => (itemEditorOptions.value = val),
      itemEditorOptions,
      openItemEditorAbove: computed(() => false),
    };
  },
});
</script>

<style scoped>
.floating-icon {
  /* make sure the element is on its own compositing layer and animatable */
  will-change: transform, opacity;
  animation-name: floatUpFade;
  animation-duration: 1400ms;        /* total animation time */
  animation-fill-mode: forwards;    /* keep final state (opacity 0) until removed */
  /* optionally add a tiny transition for transform/opacity changes outside the animation */
}

/* keyframes: start at original spot (0), then accelerate upward and fade out */
@keyframes floatUpFade {
  0% {
    transform: translate(-50%, -50%) translateY(0); /* keep centering transform included */
    opacity: 1;
  }
  100% {
    /* final: moved up more and fully transparent */
    transform: translate(-50%, -50%) translateY(-30px);
    opacity: 0;
  }
}
</style>