import * as S from './styles';
import { useCallback, useEffect, useState } from 'react';
import { CreatorPublishPermissions, ElPatoConnection } from '../../../../../../api/elPatoClipApi/types';
import { Button } from '../../../../../Atoms/Button';
import { Input } from '../../../../../Atoms/Input';
import { Select } from '../../../../../Atoms/Select';
import { ConnectionButton } from '../../../../../Molecules/ConnectionButton';
import { useAuth } from '../../../../../../authContext/useAuth';
import { ElPatoApi } from '../../../../../../api/elPatoClipApi';
import { ApiResponse } from '../../../../../../api/types';
import { useEditorState } from '../../../../../../store/EditorState/useEditorState';
import { IS_CLIENT_UNAUDITED } from '../../../../../../config';
import { TiktokApi } from '../../../../../../api/tiktokApi';
import { ProgressBar } from '../../../../../Atoms/ProgressBar';
import { Check, CheckProps } from '../../../../../Molecules/Check';


const privacyEnumToDisplayName: Record<string, string> = {
  'PUBLIC_TO_EVERYONE': 'Public',
  'MUTUAL_FOLLOW_FRIENDS': 'Friends only',
  'SELF_ONLY': 'Private',
  'FOLLOWER_OF_CREATOR': 'Followers only',
};

export interface TikTokPublishFormData {
  allowComment: boolean,
  allowDuet: boolean,
  allowStitch: boolean,
  title: string,
  privacy: string
}

export interface TiktokPublishFormProps {
  videoUrl: string,
}

export const TiktokPublishForm = ({
  videoUrl
}: TiktokPublishFormProps) => {
  const auth = useAuth();
  const videoDurationInSeconds = useEditorState(state => state.videoMetadata.totalTime);
  const [uploadProgress, setUploadProgress] = useState<{
    amount: number,
    error?: string,
    steps: {
      create: CheckProps['status'],
      upload: CheckProps['status'],
      verify: CheckProps['status']
    }
  }>({
    amount: 0,
    steps: {
      create: 'notStarted',
      upload: 'notStarted',
      verify: 'notStarted'
    }
  });

  const [status, setStatus] = useState<'form' | 'uploading'>('form');
  const [connection, setConnection] = useState<ApiResponse<ElPatoConnection> | null>(null);
  const [formData, setFormData] = useState<TikTokPublishFormData>({
    allowComment: false,
    allowDuet: false,
    allowStitch: false,
    privacy: '',
    title: ''
  });

  const [creatorPermissions, setCreatorPermissions] = useState<{
    error: string | null,
    isLoading: boolean,
    permissions: CreatorPublishPermissions | null
  }>({
    isLoading: true,
    permissions: null,
    error: null
  });

  useEffect(() => {
    if (!auth.isAuthorized || !connection?.data) return;

    const load = async() => {

      setCreatorPermissions({
        isLoading: true,
        error: null,
        permissions: null
      });

      const resp = await ElPatoApi.getTiktokCreatorPermissions(auth.token);

      if (resp.error) {
        setCreatorPermissions({
          error: 'Unable to get tiktok account information. Please try again later',
          isLoading: false,
          permissions: null
        });
        return;
      }

      if (resp.data.error.code !== 'ok') {
        setCreatorPermissions({
          error: resp.data.error.message,
          isLoading: false,
          permissions: null
        });
      }

      const privacyOptions = IS_CLIENT_UNAUDITED ? (
        resp.data.data.privacy_level_options.filter(value => value === 'SELF_ONLY')
      ) : resp.data.data.privacy_level_options;

      setCreatorPermissions({
        error: null,
        isLoading: false,
        permissions: {
          ...resp.data.data,
          privacy_level_options: privacyOptions
        },
      });
    };

    load();
  }, [auth, connection]);

  const onUploadClicked = useCallback(async () => {
    // validation
    if (formData.privacy.length === 0) return;
    if (!auth.isAuthorized) throw new Error('user is not authenticated');
    setStatus('uploading');
    setUploadProgress({
      error: undefined,
      amount: 0,
      steps: { create: 'progress', upload: 'notStarted', verify: 'notStarted' }
    });

    const videoBlob = await (await fetch(videoUrl)).blob();
    // TODO - break it into chunks correctly
    const chunkAmount = 1; // Math.ceil(videoBlob.size / 6000000);
    const chunkSize = videoBlob.size;//Math.ceil(videoBlob.size / chunkAmount);

    setUploadProgress({
      amount: 20,
      steps: { create: 'progress', upload: 'notStarted', verify: 'notStarted' }
    });

    const videoContainerUrl = await ElPatoApi.initiateVideo({
      post_info: {
        brand_content_toggle: false,
        brand_organic_toggle: false,
        disable_comment: formData.allowComment,
        disable_duet: formData.allowDuet,
        disable_stitch: formData.allowStitch,
        privacy_level: formData.privacy,
        title: formData.title,
        video_cover_timestamp_ms: 100
      }, 
      source_info: {
        chunk_size: chunkSize,
        video_size: videoBlob.size,
        source: 'FILE_UPLOAD',
        total_chunk_count: chunkAmount
      }
    }, auth.token);

    if (videoContainerUrl.error !== null) {
      setUploadProgress(prev => ({
        ...prev,
        steps: { ...prev.steps, create: 'error' },
        error: videoContainerUrl.error
      }));
      return;
    }

    setUploadProgress({
      amount: 40,
      steps: { create: 'completed', upload: 'progress', verify: 'notStarted' }
    });

    const uploadUrl = videoContainerUrl.data.upload_url;
    const publishId = videoContainerUrl.data.publish_id;

    for (let i = 0; i < chunkAmount; i++) {
      const start = i * chunkSize;
      const data = videoBlob.slice(start, Math.min(start + chunkSize, videoBlob.size));
      console.log(`Uploading one chunk of size ${data.size}`); 
      const isSuccess = await TiktokApi.uploadVideoChunk(uploadUrl, data.size, start, videoBlob.size, data);
      if (!isSuccess) {
        setUploadProgress(prev => ({
          ...prev,
          steps: { ...prev.steps, upload: 'error' },
          error: 'Failed to upload video. Please try again later'
        }));
        return;
      }
    }

    setUploadProgress({
      amount: 60,
      steps: { create: 'completed', upload: 'completed', verify: 'progress' }
    });

    const getUploadStatus = async () => {
      const resp = await ElPatoApi.getVideoStatus(publishId, auth.token);
      if (resp.error) {
        setUploadProgress(prev => ({
          ...prev,
          error: resp.error,
          steps: { ...prev.steps, verify: 'error' }
        }));
        return false;
      }
      setUploadProgress({
        amount: 100,
        steps: { create: 'completed', upload: 'completed', verify: 'completed' }
      });
      return true;
    };

    const startTimeout = () => {
      setTimeout(async () => {
        const success = await getUploadStatus();
        if (success) return;
        startTimeout();
      }, 1000);
    };
    startTimeout();

  }, [auth, videoUrl, formData]);

  const onReset = () => {
    setStatus('form');
  };

  if (!auth) return null;

  const maxAllowedVideoInSeconds = creatorPermissions.permissions?.max_video_post_duration_sec;
  const isOverVideoLimit = (maxAllowedVideoInSeconds === undefined ? false : videoDurationInSeconds > maxAllowedVideoInSeconds);

  if (status === 'uploading') return (
    <S.Card>
      <S.CheckList>
        <Check status={uploadProgress.steps.create}>Create container</Check>
        <Check status={uploadProgress.steps.upload}>Upload Video</Check>
        <Check status={uploadProgress.steps.verify}>Verify Status</Check>
      </S.CheckList>

      { uploadProgress.error && (
        <>
          <S.ErrorText>{uploadProgress.error}</S.ErrorText>
          <Button onClick={onReset} $variant='secondary'>Back</Button>
        </>
      )}

      { !uploadProgress.error && (
        <>
          { uploadProgress.steps.verify === 'completed' ? (
            <p>You can now close the tab</p>
          ) :
            <S.WarningText>Please don't close the tab</S.WarningText>
          }

          <ProgressBar progress={uploadProgress.amount} total={100} />
        </>
      )}
    </S.Card>
  );

  if (status === 'form') {
    return (
      <S.Container onSubmit={(e) => { e.preventDefault(); }}>
        <h3>Share to TikTok</h3>
        <ConnectionButton onChange={setConnection} type='tiktok' />

        { connection?.data && (
          <>
            <S.InputGroup>
              <label htmlFor='title-input'>Title</label>

              <Input
                id="title-input"
                max={2200}
                value={formData.title} 
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  title: e.target.value
                }))}
                size='sm'
              />
            </S.InputGroup>

            <S.InputGroup>
              <label htmlFor='tiktok-form-privacy-select'>Privacy</label>
              <Select
                id='tiktok-form-privacy-select'
                required
                value={formData.privacy}
                onChange={(e) => setFormData(prev => ({...prev, privacy: e.target.value }))}
              >
                <option value=""></option>
                {
                  creatorPermissions.permissions?.privacy_level_options.map((privacyLevel) => (
                    <option key={privacyLevel} value={privacyLevel}>{
                      privacyEnumToDisplayName[privacyLevel] ?? privacyLevel
                    }</option>
                  ))
                }
              </Select>
            </S.InputGroup>

            <div>

              { !!creatorPermissions.permissions?.comment_disabled || !creatorPermissions.isLoading && (
                <>
                  <S.Checkbox 
                    checked={formData.allowComment}
                    id="allow-comment-checkbox"
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        allowComment: e.target.checked
                      }));
                    }}
                    disabled={
                      creatorPermissions.isLoading
                    }
                    type='checkbox'
                  />
                  <label 
                    htmlFor="allow-comment-checkbox"
                  >Allow comment</label>
                </>
              )}

              { !!creatorPermissions.permissions?.duet_disabled || !creatorPermissions.isLoading && (
                <>
                  <S.Checkbox 
                    checked={formData.allowDuet}
                    id='allow-duet-checkbox'
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        allowDuet: e.target.checked
                      }));
                    }}
                    disabled={ creatorPermissions.isLoading }
                    type='checkbox' 
                  />
                  <label
                    htmlFor='allow-duet-checkbox'
                  >Allow duet</label>
                </>
              )}


              { !!creatorPermissions.permissions?.stitch_disabled || !creatorPermissions.isLoading && (
                <>
                  <S.Checkbox
                    checked={formData.allowStitch}
                    type='checkbox'
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        allowStitch: e.target.checked
                      }));
                    }}
                    disabled={
                      creatorPermissions.isLoading || !!creatorPermissions?.permissions?.stitch_disabled
                    }
                    id='allow-stitch-checkbox'
                  />
                  <label
                    htmlFor='allow-stitch-checkbox'
                  >Allow stitch</label>
                </>
              )}
            </div>

            {IS_CLIENT_UNAUDITED && (
              <S.WarningText>
              At the moment we can only upload videos to private accounts and as a private video.
              You can then change the privacy setting after uploading is complete
              </S.WarningText>
            )}

            { isOverVideoLimit && (
              <S.ErrorText>
              This clips is too long, you can upload up to {maxAllowedVideoInSeconds} seconds
              </S.ErrorText>
            )}

            <S.AgreementText>
            By posting, you agree to TikTok's {' '}
              <a target='_blank' href='https://www.tiktok.com/legal/page/global/music-usage-confirmation/en'>
              Music Usage Confirmation
              </a>
            </S.AgreementText>

            <S.ButtonGroup>
              <Button
                type='submit'
                onClick={onUploadClicked}
                disabled={creatorPermissions.isLoading || isOverVideoLimit}
                $variant='primary'
              >Publish</Button>
            </S.ButtonGroup>
          </>
        )}
      </S.Container>
    );
  }

};