import {
  Component,
  OnInit,
  ElementRef,
  ViewContainerRef,
  NgZone
} from '@angular/core';
import {Router} from '@angular/router';
import {MdDialog, MdDialogRef, MdDialogConfig} from '@angular/material';
import {ConfirmRegisterModalComponent} from "./modal/modal.component";
import {LoggerService} from "../../common/services/logger.service";

import {
  IUser,
  IUserDiscountCardConnectionResponse
} from '../../../typings';


import {EvotorService} from '../../common/services/evotor.service';
import {EvotorResource} from '../../common/resources/evotor.resource';
import {NotificationService} from '../../common/services/notification.service';
import {UserService} from '../../services/user.service';
import {DiscountCardsService} from '../../services/discount-cards.service';
import {INPUT_MASKS} from "../../common/constants/inputMasks";
const _get = require('lodash/get');


@Component({
  selector: 'app-start',
  templateUrl: './start.component.html',
  styleUrls: ['./start.component.scss']
})
export class StartComponent implements OnInit {

  private isSubmitBlocked: boolean = false;

  public isPhoneLoading:boolean = false;
  public isCardLoading:boolean = false;

  constructor(private logger: LoggerService,
              private router: Router,
              private elementRef: ElementRef,
              private viewContainerRef: ViewContainerRef,
              private evo: EvotorService,
              private evoResource: EvotorResource,
              private notificator: NotificationService,
              private dialog: MdDialog,
              private _zone: NgZone,
              public user: UserService,
              public discountCards: DiscountCardsService,
              public INPUT_MASKS: INPUT_MASKS) {
  }

  ngOnInit() {
    this.evo.scannerEvents.subscribe(
      data => {
        this._zone.run(() => {
          console.warn('[WORKS!]',data)
          if (typeof data === 'string') {
            this.user.cardNumber = data;
            if (this.isCardValid(this.user.cardNumber)) {
              this.submitForm(this.user.cardNumber);
            }
          }
        })
      }
    );
  }

  onInputInput(e: Event) {
    let el = e.currentTarget as HTMLInputElement;
    this.INPUT_MASKS.setDefaultValue(el, el.name)
  }

  onInputBlur(e: Event) {
    let el = e.target as HTMLInputElement;
    this.INPUT_MASKS.unsetDefaultValue(el, el.name);
  }

  onInputFocus(e: FocusEvent) {
    let el = e.currentTarget as HTMLInputElement;
    this.INPUT_MASKS.setDefaultValue(el, el.name)
  }

  isPhoneValid(val) {
    try {
      return this.evoResource.clearInput(val).length >= 11
    } catch (err) {
      return false;
    }
  }

  isCardValid(val) {
    console.warn('isCardValid',val)
    try {
      return this.evoResource.clearInput(val).length >= 16
    } catch (err) {
      return false;
    }
  }

  openConfigmDialog(cb) {
    let config = Object.assign(new MdDialogConfig(), {
      viewContainerRef: this.viewContainerRef,
      height: 240
    });

    let dialogRef:MdDialogRef<ConfirmRegisterModalComponent> = this.dialog.open(
      ConfirmRegisterModalComponent, config
    );

    dialogRef.afterClosed().subscribe(cb);
    return dialogRef;
  }

  setData(data: IUserDiscountCardConnectionResponse) {
    try {

      UserService.setData(data)

    } catch (err) {
      this.logger.log(LoggerService.LogTypes.error, err)
    }
  }

  submitForm(data) {
    console.info('submit form', data);
    if (this.isSubmitBlocked) return;

    this.isSubmitBlocked = true;

    if ( !this.isPhoneValid(this.user.phone)) this.user.phone = '';
    if ( !this.isCardValid(this.user.cardNumber)) this.user.cardNumber = '';

    if (this.user.phone) this.isPhoneLoading = true;
    if (this.user.cardNumber) this.isCardLoading = true;

    let params = {
      phone: this.isPhoneValid(this.user.phone)?this.user.phone:"",
      card: this.user.cardNumber
    };

    setTimeout(()=>{
      this.evoResource.checkUser(params)
        .finally(() => {
          this.isSubmitBlocked = false;
          this.isPhoneLoading = false;
          this.isCardLoading = false;
        })
        .subscribe(
          (res: IUserDiscountCardConnectionResponse) => {

            try {

              this.logger.log(LoggerService.LogTypes.responseSuccess, res)

              let state = res.state || {
                  has_user: false,
                  has_loyalty: false,
                  is_phone_number_valid: true
                };
              let user = res.user || {};
              let discountCards = res.discount_cards || [];
              let responseMessages = res.messages || {};

              console.info('response', res);

              if (state.is_phone_number_valid === false) {
                return this.notificator.log({
                  data: responseMessages.invalid_phone || 'Некорректный номер телефона',
                  action: 'ok'
                });
              }

              if (state.has_user && state.has_loyalty) {
                // TODO properly get current discountcard percent, not just first card
                this.setData(res);

                let discountCardPercent = _get(res,'discount_cards[0].percent',0);
                let discountCardId = _get(res,'discount_cards[0].discountcard_id',0);
                let userId = _get(res,'user.id',null);
                let userPhone = _get(res,'user.phone',null);
                let cardNumber = _get(res,'mastercard.card_number',null);

                discountCardPercent && this.evo.applyDiscount(discountCardPercent);

                this.evo.addExtraDataToReceipt({
                  user_id: userId,
                  user_phone: userPhone,
                  card_number: cardNumber,
                  discountcard_id: discountCardId
                });

                this.evo.close();

                return false;

              } else if (state.has_user && !state.has_loyalty) {

                this.setData(res);
                return this.router.navigateByUrl('select-layalty');

              } else if (!state.has_user && !state.has_loyalty) {

                console.warn('no user.id');
                return this.router.navigateByUrl('select-layalty');

              }

            } catch (err) {
              this.logger.log(LoggerService.LogTypes.error, err)
            }

          },
          (err) => {
            console.warn('request error:', err);
            this.logger.log(LoggerService.LogTypes.responseError, err)
            this.notificator.error({data: 'request error'});
          })
    },10)
  }

}

