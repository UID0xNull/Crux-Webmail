// ============================================================================
// Crux-Webmail — Index de Mocks para Testing
// ============================================================================

export { ModelMock } from './sequelize.mock';
export { IMAPMock, mockIMAPConnect, mockIMAPDisconnect, mockIMAPListFolders, mockIMAPFetchByUID, mockIMAPSearch, mockIMAPMarkFlag, mockIMAPDelete, mockIMAPMove } from './imap.mock';
export { SMTPMock, mockSMTPSend, mockSMTPClose } from './smtp.mock';
export { BullMQMock, mockAddJob, mockGetQueueStats, mockQueueIsPaused } from './bullmq.mock';