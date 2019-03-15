export interface Affirm {
    checkout: AffirmCheckout;
    ui: {
        error: {
            on(event: string, callback: () => void): void,
        };
        ready(callback: () => void): void;
    };
}

interface AffirmCheckout {
    (options: AffirmRequestData): void;
    open(modalOptions: any): void;
    init(): void;
}

export interface AffirmHostWindow extends Window {
    affirm?: Affirm;
}

export interface SuccessAffirm {
    checkout_token: string;
    created: string;
}

export interface FailAffirm {
    reason: string;
}

export interface AffirmRequestData {
    merchant: {
        user_confirmation_url: string,
        user_cancel_url: string,
        user_confirmation_url_action?: string,
        name?: string,
    };
    shipping: AffirmAddress;
    billing?: AffirmAddress;
    items: AffirmItem[];
    discounts: AffirmDiscount;
    metadata: {
        shipping_type: string,
        entity_name?: string,
        platform_type?: string,
        webhook_session_id?: string,
        mode?: string,
    };
    order_id?: string;
    shipping_amount: number;
    tax_amount: number;
    total: number;
}

export interface AffirmItem {
    display_name: string;
    sku: string;
    unit_price: number;
    qty: number;
    item_image_url: string;
    item_url: string;
    categories?: Array<[string]>;
}

export interface AffirmDiscount {
    [key: string]: {
        discount_amount: number,
        discount_display_name: string,
    };
}

export interface AffirmAddress {
    name: {
        first: string,
        last: string,
        full?: string,
    };
    address: {
        line1: string,
        line2?: string,
        city: string,
        state: string,
        zipcode: string,
        country?: string,
    };
    phone_number?: string;
    email?: string;
}

interface AffirmScripts {
    PROD: string;
    SANDBOX: string;
}

export const SCRIPTS_DEFAULT: AffirmScripts = {
    PROD: '//cdn1.affirm.com/js/v2/affirm.js',
    SANDBOX: '//cdn1-sandbox.affirm.com/js/v2/affirm.js',
};
