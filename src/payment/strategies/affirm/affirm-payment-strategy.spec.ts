import { createClient as createPaymentClient } from '@bigcommerce/bigpay-client';
import { createAction, Action } from '@bigcommerce/data-store';
import { createRequestSender } from '@bigcommerce/request-sender';
import { merge } from 'lodash';
import { of, Observable } from 'rxjs';

import { getBillingAddressState } from '../../../billing/billing-addresses.mock';
import { getCartState } from '../../../cart/carts.mock';
import { createCheckoutStore, CheckoutRequestSender, CheckoutStore, CheckoutValidator } from '../../../checkout';
import { getCheckoutState } from '../../../checkout/checkouts.mock';
import { MissingDataError, NotInitializedError } from '../../../common/error/errors';
import { getConfigState } from '../../../config/configs.mock';
import { getCustomerState } from '../../../customer/customers.mock';
import { OrderActionCreator, OrderActionType, OrderRequestBody, OrderRequestSender } from '../../../order';
import { OrderFinalizationNotRequiredError } from '../../../order/errors';
import { getOrderRequestBody } from '../../../order/internal-orders.mock';
import { getPaymentMethodsState } from '../../../payment/payment-methods.mock';
import { getConsignmentsState } from '../../../shipping/consignments.mock';
import { PaymentArgumentInvalidError, PaymentMethodCancelledError } from '../../errors';
import PaymentActionCreator from '../../payment-action-creator';
import { PaymentActionType } from '../../payment-actions';
import PaymentMethod from '../../payment-method';
import PaymentMethodActionCreator from '../../payment-method-action-creator';
import { PaymentMethodActionType } from '../../payment-method-actions';
import PaymentMethodRequestSender from '../../payment-method-request-sender';
import { getAffirm } from '../../payment-methods.mock';
import PaymentRequestSender from '../../payment-request-sender';

import { AffirmPaymentStrategy, AffirmScriptLoader } from './';
import { Affirm } from './affirm';
import { getAffirmScriptMock } from './affirm.mock';

describe('AffirmPaymentStrategy', () => {
    let affirm: Affirm;
    let checkoutValidator: CheckoutValidator;
    let checkoutRequestSender: CheckoutRequestSender;
    let orderActionCreator: OrderActionCreator;
    let orderRequestSender: OrderRequestSender;
    let payload: OrderRequestBody;
    let paymentActionCreator: PaymentActionCreator;
    let paymentMethodActionCreator: PaymentMethodActionCreator;
    let paymentMethod: PaymentMethod;
    let submitOrderAction: Observable<Action>;
    let submitPaymentAction: Observable<Action>;
    let store: CheckoutStore;
    let strategy: AffirmPaymentStrategy;
    let scriptLoader: AffirmScriptLoader;
    let loadPaymentMethodAction: Observable<Action>;

    beforeEach(() => {
        const requestSender = createRequestSender();

        affirm = getAffirmScriptMock();
        affirm.checkout.open = jest.fn();
        affirm.ui.error.on = jest.fn();
        orderRequestSender = new OrderRequestSender(requestSender);
        store = createCheckoutStore({
            checkout: getCheckoutState(),
            customer: getCustomerState(),
            config: getConfigState(),
            cart: getCartState(),
            paymentMethods: getPaymentMethodsState(),
            consignments: getConsignmentsState(),
            billingAddress: getBillingAddressState(),
        });
        checkoutRequestSender = new CheckoutRequestSender(requestSender);
        checkoutValidator = new CheckoutValidator(checkoutRequestSender);
        orderActionCreator = new OrderActionCreator(orderRequestSender, checkoutValidator);
        paymentActionCreator = new PaymentActionCreator(
            new PaymentRequestSender(createPaymentClient()),
            orderActionCreator
        );
        paymentMethodActionCreator = new PaymentMethodActionCreator(new PaymentMethodRequestSender(requestSender));
        scriptLoader = new AffirmScriptLoader();
        strategy = new AffirmPaymentStrategy(
            store,
            orderActionCreator,
            paymentActionCreator,
            paymentMethodActionCreator,
            scriptLoader
        );

        paymentMethod = getAffirm();

        payload = merge({}, getOrderRequestBody(), {
            payment: {
                methodId: paymentMethod.id,
                gatewayId: paymentMethod.gateway,
            },
        });
        submitOrderAction = of(createAction(OrderActionType.SubmitOrderRequested));
        submitPaymentAction = of(createAction(PaymentActionType.SubmitPaymentRequested));
        loadPaymentMethodAction = of(createAction(PaymentMethodActionType.LoadPaymentMethodSucceeded, paymentMethod, { methodId: paymentMethod.id }));

        jest.spyOn(store, 'dispatch');

        jest.spyOn(orderActionCreator, 'submitOrder')
            .mockReturnValue(submitOrderAction);

        jest.spyOn(paymentActionCreator, 'submitPayment')
            .mockReturnValue(submitPaymentAction);

        jest.spyOn(store.getState().paymentMethods, 'getPaymentMethod')
            .mockReturnValue(paymentMethod);

        jest.spyOn(paymentMethodActionCreator, 'loadPaymentMethod')
            .mockReturnValue(loadPaymentMethodAction);

        jest.spyOn(scriptLoader, 'load').mockReturnValue(Promise.resolve(affirm));

        payload = merge({}, getOrderRequestBody(), {
            payment: {
                methodId: paymentMethod.id,
                gatewayId: paymentMethod.gateway,
            },
        });
    });

    describe('#initialize()', () => {
        it('throws error if client token is missing', async () => {
            paymentMethod.clientToken = '';
            try {

                await strategy.initialize({ methodId: paymentMethod.id });
            } catch (error) {
                expect(error).toBeInstanceOf(MissingDataError);
            }
        });

        it('loads affirm script from snippet', async () => {
            await strategy.initialize({ methodId: paymentMethod.id });
            expect(scriptLoader.load).toBeCalledWith(paymentMethod.clientToken, false);
        });
    });

    describe('#execute()', () => {

        beforeEach(async () => {
            await strategy.initialize({ methodId: paymentMethod.id, gatewayId: paymentMethod.gateway });

            jest.spyOn(store, 'dispatch').mockReturnValue(Promise.resolve());
            jest.spyOn(affirm.checkout, 'open').mockImplementation(({ onSuccess }) => {
                onSuccess({
                    checkout_token: '1234',
                    created: '1234',
                });
            });
            jest.spyOn(store.getState().paymentMethods, 'getPaymentMethod').mockReturnValue(paymentMethod);

        });

        it('creates order, checkout and payment', async () => {
            const options = { methodId: 'affirm', gatewayId: undefined };

            await strategy.execute(payload, options);

            expect(store.dispatch).toHaveBeenCalledWith(submitOrderAction);

            expect(orderActionCreator.submitOrder).toHaveBeenCalledWith({ useStoreCredit: false }, options);
            expect(affirm.checkout).toHaveBeenCalled();
            expect(affirm.checkout.open).toHaveBeenCalled();
            expect(affirm.ui.error.on).toHaveBeenCalled();
            expect(store.dispatch).toHaveBeenCalledWith(submitPaymentAction);
            expect(paymentActionCreator.submitPayment).toBeCalledWith({
                methodId: paymentMethod.id,
                paymentData: { nonce: '1234' },
            });

        });

        it('returns error on affirm if users cancel flow', async () => {
            jest.spyOn(affirm.checkout, 'open').mockImplementation(({ onFail }) => {
                onFail();
            });
            try {
                await strategy.execute(payload);
            } catch (error) {
                expect(error).toBeInstanceOf(PaymentMethodCancelledError);
            }
        });

        it('does not create payment if moethodId not specified', async () => {
            try {
                await strategy.execute(payload);
            } catch (error) {
                expect(error).toBeInstanceOf(NotInitializedError);
            }
        });

        it('does not create order if paymentId is not set', async () => {
            payload.payment = undefined;
            try {
                await strategy.execute(payload);
            } catch (error) {
                expect(error).toBeInstanceOf(PaymentArgumentInvalidError);
            }
        });

        it('does not create affirm object if config does not exist', async () => {
            jest.spyOn(store.getState().config, 'getStoreConfig').mockReturnValue(undefined);
            try {
                await strategy.execute(payload);
            } catch (error) {
                expect(error).toBeInstanceOf(MissingDataError);
            }
        });

        it('does not create affirm object if billingAddress does not exist', async () => {
            jest.spyOn(store.getState().billingAddress, 'getBillingAddress').mockReturnValue(undefined);
            try {
                await strategy.execute(payload);
            } catch (error) {
                expect(error).toBeInstanceOf(MissingDataError);
            }
        });

        it('does not create affirm object if cart does not exist', async () => {
            jest.spyOn(store.getState().cart, 'getCart').mockReturnValue(undefined);
            try {
                await strategy.execute(payload);
            } catch (error) {
                expect(error).toBeInstanceOf(MissingDataError);
            }
        });
    });

    describe('#deinitialize()', () => {

        let submitOrderAction: Observable<Action>;
        const affirmOptions = { methodId: 'affirm', gatewayId: undefined };

        beforeEach(async () => {
            submitOrderAction = of(createAction(OrderActionType.SubmitOrderRequested));
            orderActionCreator.submitOrder = jest.fn(() => submitOrderAction);

            await strategy.initialize(affirmOptions);
        });

        it('expect to not call the orderActionCreator', async () => {
            await strategy.deinitialize(affirmOptions);

            expect(orderActionCreator.submitOrder).not.toHaveBeenCalled();
        });

        it('deinitializes strategy', async () => {
            await strategy.deinitialize();
            expect(await strategy.deinitialize()).toEqual(store.getState());
        });
    });

    describe('#finalize()', () => {
        it('throws error to inform that order finalization is not required', async () => {
            try {
                await strategy.finalize();
            } catch (error) {
                expect(error).toBeInstanceOf(OrderFinalizationNotRequiredError);
            }
        });
    });

});
