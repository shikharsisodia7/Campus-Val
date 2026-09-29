/**
 * Degree Checksheets for the mobile app: the shared hooks, over the API calls
 * this app makes. The web app builds its hooks from the very same factory, so
 * both read, save and reconcile tracking identically.
 */
import {
  createChecksheetHooks,
  createDegreeChecksheetAnnotation,
  deleteDegreeChecksheetAnnotation,
  getGetDegreeChecksheetRenderQueryKey,
  getListDegreeChecksheetAnnotationsQueryKey,
  getListDegreeChecksheetsQueryKey,
  updateDegreeChecksheetAnnotation,
  useGetDegreeChecksheetRender,
  useListDegreeChecksheetAnnotations,
  useListDegreeChecksheets,
} from '@workspace/api-client-react';

export const { useChecksheetDocuments, useChecksheetRender, useInvalidateChecksheets, useChecksheetTracking } = createChecksheetHooks({
  useListDegreeChecksheets,
  useGetDegreeChecksheetRender,
  useListDegreeChecksheetAnnotations,
  getListDegreeChecksheetsQueryKey,
  getGetDegreeChecksheetRenderQueryKey,
  getListDegreeChecksheetAnnotationsQueryKey,
  createDegreeChecksheetAnnotation,
  updateDegreeChecksheetAnnotation,
  deleteDegreeChecksheetAnnotation,
});
