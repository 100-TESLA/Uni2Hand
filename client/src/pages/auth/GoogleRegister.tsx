import React from 'react';
import { GoogleRegisterCard } from '../../components/auth/google-register-card';
import { BlobBackground } from '../../components/auth/blob-background';
import { DecorationShape } from '../../components/auth/decoration-shape';

const GoogleRegister: React.FC = () => {
    return (
        <div className="relative min-h-screen flex items-center justify-center p-4 bg-[#F2FAFF] overflow-hidden">
            <BlobBackground />
            <DecorationShape />
            <GoogleRegisterCard />
        </div>
    );
};

export default GoogleRegister;
