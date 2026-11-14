import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import styled from 'styled-components';

import useMigrationEntry from '../components/account-export/useMigrationEntry';
import FormButton from '../components/common/FormButton';
import FormButtonGroup from '../components/common/FormButtonGroup';
import Modal from '../components/common/modal/Modal';
import {
    trackSunsetNoticeCtaClicked,
    trackSunsetNoticeShown,
} from '../components/sunset/sunsetAnalytics';
import { usePhase3Date } from '../components/sunset/sunsetDates';
import { isSunsetPromptFreePath } from '../components/sunset/sunsetRoutes';
import SunsetIcon from '../components/sunset/SunsetIcon';
import { SUNSET_LEARN_MORE_URL, SUNSET_PHASE } from '../config/sunset';
import { selectAccountLocalStorageAccountId } from '../redux/slices/account';
import { selectPasswordProtectionSlice } from '../redux/slices/passwordProtectedWallet/passwordProtectedWallet';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How often each phase may show the notice. Each phase has its own key, so moving to a new phase
 * shows its notice straight away. Phase 3 shows once per browser session.
 */
const CADENCE = {
    1: { storage: 'local', key: 'sunsetNoticeLastShownAt', intervalMs: 4 * DAY_MS },
    2: { storage: 'local', key: 'sunsetNoticeLastShownAt:phase2', intervalMs: DAY_MS },
    3: { storage: 'session', key: 'sunsetNoticeShown:phase3', intervalMs: Infinity },
} as const;

const Container = styled.div`
    text-align: left;

    .title {
        font-weight: 600;
        font-size: 20px;
        color: #24272a;
        margin: 16px 0 20px;
    }

    .body {
        color: #72727a;
        font-size: 15px;
        line-height: 1.5;

        p {
            margin: 0 0 14px;
        }
    }

    .anti-phishing {
        color: #72727a;
        font-size: 13px;
        line-height: 1.5;
        margin: 0;
    }

    .divider {
        border: none;
        border-top: 1px solid #f0f0f1;
        margin: 16px 0 20px;
    }

    .not-now {
        margin-top: 12px;
        text-align: center;
    }
`;

function cadenceStore() {
    const cadence = CADENCE[SUNSET_PHASE];
    const storage = cadence.storage === 'session' ? sessionStorage : localStorage;
    return { cadence, storage };
}

function shouldShowNotice() {
    try {
        const { cadence, storage } = cadenceStore();
        const lastShownAt = Number(storage.getItem(cadence.key));
        if (!lastShownAt || Number.isNaN(lastShownAt)) {
            return true;
        }
        return Date.now() - lastShownAt > cadence.intervalMs;
    } catch {
        return false;
    }
}

function recordShown() {
    try {
        const { cadence, storage } = cadenceStore();
        storage.setItem(cadence.key, String(Date.now()));
    } catch {
        // Ignore storage failures (e.g. private mode) and still show once.
    }
}

export default function SunsetNotice() {
    const { pathname } = useLocation();
    const { dataStatus, isSignedIn } = useSelector(selectPasswordProtectionSlice);
    const [isOpen, setIsOpen] = useState(false);

    const isLocked = dataStatus?.hasEncryptedData && !isSignedIn;
    const canShowHere = !isLocked && !isSunsetPromptFreePath(pathname);

    useEffect(() => {
        if (!isOpen && canShowHere && shouldShowNotice()) {
            recordShown();
            setIsOpen(true);
            trackSunsetNoticeShown({ variant: `phase${SUNSET_PHASE}` });
        }
    }, [canShowHere]);

    if (!isOpen) {
        return null;
    }

    return <SunsetNoticeModal onClose={() => setIsOpen(false)} />;
}

function SunsetNoticeModal({ onClose }) {
    return (
        // @ts-ignore — Modal is a JS component without full prop typings
        <Modal id='modal-sunset-notice' isOpen onClose={onClose} modalSize='sm'>
            <Container>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                    <div
                        style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            backgroundColor: '#e6f7f2',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#008d6a',
                            fontSize: '18px',
                            fontWeight: 700,
                            border: '1px solid #a7f3d0',
                        }}
                    >
                        .uni
                    </div>
                    <div>
                        <h3 className='title' style={{ margin: 0, fontSize: '19px' }}>
                            Universal Name Edition
                        </h3>
                        <span style={{ fontSize: '13px', color: '#008d6a', fontWeight: 500 }}>
                            MyNearWallet Community Fork
                        </span>
                    </div>
                </div>
                <hr className='divider' />
                <div className='body'>
                    <p>
                        This is an active open-source fork of MyNearWallet updated with native{' '}
                        <strong>Universal Name (<code>.uni</code>)</strong> cross-chain domain resolution.
                    </p>
                    <p>
                        You can send NEAR and Fungible Tokens directly to human-readable domain names (e.g.,{' '}
                        <strong>peni.uni</strong>, <strong>alice.uni</strong>). The wallet resolves recipient addresses in real-time using our smart contract on NEAR (
                        <strong>uname-registry.near</strong>).
                    </p>
                    <p>
                        Powered by the Universal Name Resolver API (
                        <a
                            href='https://api.unamereg.xyz'
                            target='_blank'
                            rel='noopener noreferrer'
                            style={{ color: '#008d6a', fontWeight: 500 }}
                        >
                            api.unamereg.xyz
                        </a>
                        ) with decentralized on-chain JSON-RPC fallback.
                    </p>
                </div>
                <FormButtonGroup>
                    <FormButton
                        color='gray-blue'
                        className='border'
                        onClick={() => {
                            window.open(
                                'https://github.com/Penivera/Uname',
                                '_blank',
                                'noopener,noreferrer'
                            );
                        }}
                    >
                        View on GitHub
                    </FormButton>
                    <FormButton
                        onClick={() => {
                            onClose();
                        }}
                    >
                        Continue to Wallet
                    </FormButton>
                </FormButtonGroup>
            </Container>
        </Modal>
    );
}
