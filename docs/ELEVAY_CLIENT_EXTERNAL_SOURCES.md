# ELEVAY Client External Sources

The implementation is governed by the attached **Elevay Client Mobile App Product & Implementation Specification** dated 6 September 2026. The source document is available in this task at `/home/ubuntu/upload/Elevay_Client_App_Product_Specification.docx`.

The mobile foundation is the private GitHub repository at <https://github.com/mahmoudmsaberelevay/elevay-mobile>. It is an Expo 54 and React Native 0.81 employee CRM application. The client app is derived from its theme, UI components, navigation patterns, API utilities, and build setup, but it receives a separate application identity and a dedicated client authorization boundary.

Public program content is synchronized from the official Elevay pages at <https://elevay.com/residency-by-investment/> and <https://elevay.com/citizenship-by-investment/>. Both pages expose program cards as level-three headings linked to country detail pages. The production parser therefore selects country links beneath `h3` elements, validates a minimum result count, deduplicates by URL slug, and preserves the last valid database content if parsing fails.

Native scanning is implemented with `expo-document-scanner`, documented at <https://github.com/DineshKachhot/expo-document-scanner>. The package uses Apple VisionKit on iOS and Google ML Kit on Android, requires React Native New Architecture, supports multi-page scans, native page detection, crop and perspective correction, gallery import on Android, and PDF output on Android. iOS returns corrected page images, which the app composes into a PDF. The mature alternative reviewed was `react-native-document-scanner-plugin` version 2.0.4 at <https://www.npmjs.com/package/react-native-document-scanner-plugin>; it supports Expo development builds and multi-page native scanning but returns images only and has fewer typed output options.

The official public pages and scanner documentation were last reviewed on 6 September 2026.
