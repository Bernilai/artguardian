// До импорта react-router-dom: RR v7 тянет код, где на этапе загрузки нужен TextEncoder в глобале (Jest/jsdom).
import { TextDecoder, TextEncoder } from "util";

Object.assign(globalThis, { TextEncoder, TextDecoder });
