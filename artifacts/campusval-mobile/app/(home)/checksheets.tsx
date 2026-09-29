import React, { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SCU_CHECKSHEETS_URL, type DegreeChecksheetDocument } from '@workspace/api-client-react';
import { useChecksheetDocuments } from '@/hooks/useChecksheets';
import { useColors } from '@/hooks/useColors';
import { DocumentCard } from '@/components/checksheets/DocumentCard';
import { UploadSheet } from '@/components/checksheets/DetailsSheet';
import { makeStyles } from '@/components/checksheets/theme';

/**
 * Degree Checksheets: the department documents a student chose to keep, and
 * their own tracking against each. The same documents and the same tracking
 * as the web app; what is set here is there, and the other way round.
 */
export default function ChecksheetsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const { width } = useWindowDimensions();
  const [uploading, setUploading] = useState(false);
  const [justUploaded, setJustUploaded] = useState<number | null>(null);
  const library = useChecksheetDocuments();

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const bottomPadding = insets.bottom + (Platform.OS === 'web' ? 34 : 96);

  if (library.isLoading) {
    return (
      <View style={[styles.flex, styles.center, { paddingTop: topPadding }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.lead}>Loading your checksheets…</Text>
      </View>
    );
  }

  if (library.isError || !library.data) {
    return (
      <View style={[styles.flex, styles.center, { paddingTop: topPadding }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text style={styles.cardTitle}>Couldn't load your checksheets</Text>
        <Text style={[styles.lead, { textAlign: 'center' }]}>Check your connection and try again.</Text>
        <Pressable style={[styles.button, styles.primary, { marginTop: 16 }]} onPress={() => void library.refetch()} accessibilityRole="button">
          <Text style={styles.primaryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const { documents, available, maxUploadBytes, maxDocuments } = library.data;
  const full = documents.length >= maxDocuments;

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { paddingTop: topPadding + 16, paddingBottom: bottomPadding }]}
        refreshControl={<RefreshControl refreshing={library.isRefetching} onRefresh={() => void library.refetch()} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.screenTitle} accessibilityRole="header">
          Degree Checksheets
        </Text>
        <Text style={styles.lead}>
          Keep the checksheets your department publishes, and track your own progress against them.
        </Text>

        <View style={[styles.card, { padding: 14, marginTop: 14, gap: 6 }]}>
          <Text style={styles.small}>
            • Checksheets are advising resources published by SCU departments. <Text style={styles.strong}>You choose</Text> the document that
            fits your planning and upload it here.
          </Text>
          <Text style={styles.small}>
            • Your status and quarter entries are your own planning notes. The original document is never changed, and only you can see
            what you upload or enter.
          </Text>
          <Text style={styles.small}>• Workday is the definitive reference for degree completion.</Text>
        </View>

        <View style={[styles.actions, { marginBottom: 14 }]}>
          <Pressable
            style={[styles.button, styles.primary, (!available || full) && styles.disabled]}
            disabled={!available || full}
            onPress={() => setUploading(true)}
            accessibilityRole="button"
            accessibilityState={{ disabled: !available || full }}
            testID="button-upload-checksheet"
          >
            <Feather name="upload" size={16} color="#FFFFFF" />
            <Text style={styles.primaryText}>Upload Checksheet</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.outline]}
            onPress={() => void Linking.openURL(SCU_CHECKSHEETS_URL)}
            accessibilityRole="link"
            accessibilityHint="Opens the SCU website in your browser"
            testID="link-scu-checksheets"
          >
            <Text style={styles.outlineText}>Find SCU Degree Checksheets</Text>
            <Feather name="external-link" size={15} color={colors.foreground} />
          </Pressable>
        </View>

        {!available && (
          <View style={[styles.notice, styles.warning, { marginBottom: 12 }]} testID="storage-unavailable">
            <Text style={[styles.body, styles.warningText]}>
              Document storage is not set up for this CampusVal, so checksheets cannot be uploaded yet. Nothing is wrong with your account.
            </Text>
          </View>
        )}
        {full && (
          <Text style={[styles.small, { marginBottom: 12 }]}>
            You have {maxDocuments} documents, the most CampusVal keeps. Delete one to upload another.
          </Text>
        )}

        {documents.length === 0 ? (
          <View style={[styles.card, { padding: 28, alignItems: 'center' }]} testID="checksheets-empty">
            <Ionicons name="documents-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.cardTitle, { marginTop: 10 }]}>No checksheets yet</Text>
            <Text style={[styles.lead, { textAlign: 'center' }]}>
              Download a checksheet from your department, then upload it here as a PDF, Excel, Word or picture file.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.small, { marginBottom: 8 }]} testID="checksheets-count">
              {documents.length} {documents.length === 1 ? 'document' : 'documents'} uploaded. Open one at a time, or several.
            </Text>
            {documents.map((document: DegreeChecksheetDocument) => (
              <DocumentCard
                key={document.id}
                document={document}
                maxUploadBytes={maxUploadBytes}
                width={width}
                defaultOpen={document.id === justUploaded}
                colors={colors}
                styles={styles}
              />
            ))}
          </>
        )}
      </ScrollView>

      {uploading && (
        <UploadSheet
          documents={documents}
          maxUploadBytes={maxUploadBytes}
          onClose={() => setUploading(false)}
          onUploaded={(document) => {
            setJustUploaded(document.id);
            setUploading(false);
          }}
          colors={colors}
          styles={styles}
        />
      )}
    </View>
  );
}
