import { Component, Input, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { CodeBlock } from './code-block.factory';
import { ActivatedRoute, Params, UrlSegment, Router } from '@angular/router';
import { CodeBlockColor, GameView } from './code-block.constant';
import { NgForOf } from '@angular/common';
import * as _ from 'lodash';
import { DATA } from '../../assets/game-sample-2';
import { CodeBlockService } from './internal/code-block.service';
import 'rxjs/add/operator/map';
import { NgIf } from '@angular/common';
import { SocketService } from '../socket/socket.service';
import { Event } from '../socket/socket-events';
import { ROUTES } from '../routes/route.constant';
import { QueryParams } from '../home-component/home-component';
@Component({
  selector: 'code-name',
  templateUrl: `./code-name.component.html`,
  providers: [CodeBlockService, SocketService],
  styleUrls: ['./code-name.component.css', '../app.css']
})
export class CodeNameComponent implements OnInit {
  @ViewChild('audioPlayerOnLoadSound') audioPlayerOnLoadSound: ElementRef;
  @ViewChild('audioLockSound') audioLockSound: ElementRef;
  @ViewChild('audioGameOverSound') audioGameOverSound: ElementRef;
  @ViewChild('audioGameWinnerSound') audioGameWinnerSound: ElementRef;

  public rows: Array<any>;
  public columns: Array<any>;
  public codeBlocks: Array<CodeBlock>;
  public colors: Array<CodeBlockColor>;
  public words: Array<string>;
  public gameId: number;
  public disableSpyMode = false;
  public loading = false;
  public maxColorLeft: number;
  public minColorLeft: number;
  public gameResultColor: CodeBlockColor;
  public CodeBlockColor = CodeBlockColor;
  public showAllCards = false;
  public spyViewCount = 0;

  private gameView: GameView;
  private maxColor = 9;
  private minColor = 8;
  private noOfRows = 5;
  private noOfColumns = 5;
  private totalBlocks = this.noOfColumns * this.noOfRows;
  private ioConnection: any;
  private messages: Array<any>;

  constructor(private route: ActivatedRoute, private codeBlockService: CodeBlockService,
    private router: Router,
    private socketService: SocketService) {
    this.codeBlocks = [];
    this.gameId = undefined;
    this.colors = [];
    this.words = [];
    this.gameView = GameView.PLAYER;
  }

  async ngOnInit() {
    this.audioPlayerOnLoadSound.nativeElement.play();
    this.initSocket();
    this.loading = true;
    this.route.queryParams
      // .toPromise();
      .subscribe(async (params: QueryParams) => {
        let id = params.id;
        if (params.spy && !!params.spy === true) {
          this.gameView = GameView.SPYMASTER;
        }
        if (id) {
          const blocksByGameID = await this.fetchCodeBlockByGameId(id);
          if (blocksByGameID && !_.isEmpty(blocksByGameID)) {
            this.codeBlocks = blocksByGameID;
            this.gameId = id;
          }
        }
        this.initGame({ id: this.gameId, blocks: this.codeBlocks });
      });
  }

  public initGame({ id, blocks }: GameData): void {
    this.gameResultColor = undefined;
    this.maxColorLeft = this.maxColor;
    this.minColorLeft = this.minColor;
    this.loading = true;
    this.gameId = id || _.random(1, 10000);
    this.shuffleColors();
    this.shuffleWords();

    // This means we are reseting the board
    if (_.isUndefined(blocks) || _.isEmpty(blocks)) {
      this.codeBlocks.length = 0;
      this.createBlocks();
      this.saveBoard();
    }
    this.loading = false;
  }

  /**
   * This will make socket connection so spy master's board will be updated
   */
  public initSocket(): void {
    this.messages = [];
    this.socketService.initSocket();
    this.ioConnection = this.socketService.onMessage()
      .subscribe((message: GameData & { count: number }) => {
        if (message && message.id && Number(message.id) === Number(this.gameId)) {
          this.codeBlocks = message.blocks;
        }
      });

    this.socketService.onEvent(Event.CONNECT)
      .subscribe((message: any) => {
      });

    this.socketService.onEvent(Event.DISCONNECT)
      .subscribe(() => {
      });
  }

  /**
   * This will emit message to node
   * @param message This will emit
   */
  public sendMessage(message: GameData): void {
    if (!message) {
      return;
    }

    this.socketService.send({
      from: this.gameId,
      message
    });
  }

  /**
   * Get css for the code block
   */
  public getCodeBlockClass(block: CodeBlock): string {
    let css = undefined;
    css = (this.gameView === GameView.SPYMASTER && !this.loading) || block.clicked ? block.color : block.currentColor;
    if (block.clicked === true && this.isSpyMasterViewOn()) {
      css = `${css} clicked`;
    }
    return css;
  }

  /**
   * Toggle spymaster view on/off
   */
  public toggleGameView(): void {
    if (this.disableSpyMode === false) {
      this.gameView = this.gameView === GameView.SPYMASTER ? GameView.PLAYER : GameView.SPYMASTER;
      this.saveBoard();
    }
  }

  /**
   * Returns if spymaster mode is on/off
   */
  public isSpyMasterViewOn(): boolean {
    return this.gameView === GameView.SPYMASTER;
  }

  /**
   * Returns if spymaster mode is on/off
   */
  public toggleShowAllCards(): void {
    this.showAllCards = !this.showAllCards;
  }

  /**
   * Action when a code block is clicked
   */
  public onBlockClick(block: CodeBlock): void {
    // Do no action when spy master mode is on game is won/over
    if (this.gameResultColor !== undefined || this.isSpyMasterViewOn() || block.clicked) {
      return;
    }
    block.clicked = true;
    // Save the board state
    this.saveBoard();
    this.isSpyMasterViewOn() === false ? block.currentColor = block.color : undefined;
    if (block.currentColor === CodeBlockColor.RED) {
      this.maxColorLeft--;
    } else if (block.currentColor === CodeBlockColor.BLUE) {
      this.minColorLeft--;
    } else if (block.currentColor === CodeBlockColor.BLACK) {
      this.gameResultColor = CodeBlockColor.BLACK;
      this.audioGameOverSound.nativeElement.play();
      return;
    }
    this.updateScore();
    if (this.gameResultColor) {
      this.audioGameWinnerSound.nativeElement.play();
    } else {
      this.audioLockSound.nativeElement.play();
    }
    setTimeout(() => {
      this.audioLockSound.nativeElement.pause();
    }, 2000);
  }

  /**
   * Navigate to home page
   */
  public navigateToHome(): void {
    this.router.navigate([ROUTES.HOME]);
  }

  /**
   * Update the score for the teams
   */
  private updateScore(): void {
    if (this.maxColorLeft === 0) {
      this.gameResultColor = CodeBlockColor.RED;
    } else if (this.minColorLeft === 0) {
      this.gameResultColor = CodeBlockColor.BLUE;
    }
  }

  /**
   * Shuffle the colors array
   * TODO: Move this to factory
   */
  private shuffleColors(): void {
    const arr = [];

    arr.push(CodeBlockColor.BLACK);
    let maxColor = this.maxColor;
    while (maxColor > 0) {
      arr.push(CodeBlockColor.RED);
      maxColor--;
    }

    let minColor = this.minColor;
    while (minColor > 0) {
      arr.push(CodeBlockColor.BLUE);
      minColor--;
    }

    let arrLength = arr.length;
    while (arrLength < this.totalBlocks) {
      arr.push(CodeBlockColor.YELLOW);
      arrLength++;
    }
    this.colors = _.shuffle(arr);
  }

  /**
   * Shuffle the words
   */
  private shuffleWords(): void {
    this.words = _.sampleSize(DATA, this.totalBlocks);
  }

  /**
   * Save the board and emit the message for socket
   */
  private saveBoard(): void {
    this.codeBlockService.storeGame({
      id: this.gameId,
      blocks: this.codeBlocks,
      spyViewCount: this.gameView === GameView.SPYMASTER ? 1 : 0,
    }).subscribe();
    this.sendMessage({
      id: this.gameId,
      blocks: this.codeBlocks
    });
  }

  /**
   * Fetch codeblocks by game id
   */
  private async fetchCodeBlockByGameId(id): Promise<Array<CodeBlock>> {
    let codeBlocks = undefined;
    const data: GameData = await this.codeBlockService.getGame({
      id
    });
    // this.disableSpyMode = data['spyViewCount'] > 1;
    if (!_.isEmpty(data.blocks)) {
      codeBlocks = _.map(data.blocks, (elem) => {
        return new CodeBlock(elem);
      });
    }
    return codeBlocks;
  }

  /**
   * Create code blocks
   */
  private createBlocks(): void {
    let id = 0;
    while (id < this.totalBlocks) {
      this.codeBlocks.push(new CodeBlock({
        color: this.colors[id],
        word: this.words[id],
        id
      }));
      id++;
    }
  }
}

export interface GameData {
  id?: number;
  blocks?: Array<CodeBlock>;
  spyViewCount?: number;
}